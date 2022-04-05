use ed25519_dalek::*;
use failure::*;
use hpos_config_core::{public_key, Config};
use lazy_static::*;
use reqwest::Client;
use serde::*;
use std::convert::TryInto;
use std::path::Path;
use std::time::Duration;
use std::{env, fmt, fs, fs::File, io::Write, thread};
use tracing::*;
use tracing_subscriber::{EnvFilter, FmtSubscriber};
use uuid::Uuid;
use zerotier_api::Identity;
mod validation;
use validation::init_validation;

fn get_holoport_url(id: PublicKey) -> String {
    if let Ok(network) = env::var("HOLO_NETWORK") {
        if network == "devNet" {
            return format!("https://{}.holohost.dev", public_key::to_base36_id(&id));
        }
    }
    format!("https://{}.holohost.net", public_key::to_base36_id(&id))
}

fn mem_proof_server_url() -> String {
    match env::var("MEM_PROOF_SERVER_URL") {
        Ok(url) => url,
        _ => "https://test-membrane-proof-service.holo.host".to_string(),
    }
}

fn mem_proof_path() -> String {
    match env::var("MEM_PROOF_PATH") {
        Ok(path) => path,
        _ => "/var/lib/configure-holochain/mem-proof".to_string(),
    }
}

fn zt_auth_done_notification_path() -> String {
    match env::var("ZT_NOTIFICATIONS_PATH") {
        Ok(path) => path,
        _ => "/var/lib/holo-auth/zt-auth-done-notification".to_string(),
    }
}

fn device_bundle_password() -> Option<String> {
    match env::var("DEVICE_BUNDLE_PASSWORD") {
        Ok(pass) => Some(pass),
        _ => None,
    }
}

lazy_static! {
    static ref CLIENT: Client = Client::new();
}

fn serialize_holochain_agent_id<S>(public_key: &PublicKey, serializer: S) -> Result<S::Ok, S::Error>
where
    S: Serializer,
{
    serializer.serialize_str(&public_key::to_base36_id(public_key))
}

fn serialize_holochain_agent_pub_key<S>(
    public_key: &PublicKey,
    serializer: S,
) -> Result<S::Ok, S::Error>
where
    S: Serializer,
{
    serializer.serialize_str(&public_key::to_holochain_encoded_agent_key(public_key))
}

#[derive(Debug, Deserialize)]
struct PostmarkPromise {
    #[serde(rename = "MessageID")]
    message_id: Uuid,
}

#[derive(Debug, Fail)]
pub enum AuthError {
    #[fail(display = "Error: Invalid config version used. please upgrade to hpos-config v2")]
    ConfigVersionError,
    #[fail(display = "Registration Error: {}", _0)]
    RegistrationError(String),
    #[fail(display = "ZtRegistration Error: {}", _0)]
    ZtRegistrationError(String),
    #[fail(display = "InitializationError Error: {}", _0)]
    InitializationError(String),
}

fn get_hpos_config() -> Fallible<Config> {
    let config_path = env::var("HPOS_CONFIG_PATH")?;
    let config_json = fs::read(config_path)?;
    let config: Config = serde_json::from_slice(&config_json)?;
    Ok(config)
}

#[derive(Debug, Serialize)]
struct ZTData {
    email: String,
    #[serde(serialize_with = "serialize_holochain_agent_id")]
    holochain_agent_id: PublicKey,
    zerotier_address: zerotier_api::Address,
    holoport_url: String,
}
#[derive(Debug, Serialize)]
struct ZTPayload {
    data: ZTData,
    signature: String,
}

async fn try_zerotier_auth(config: &Config, holochain_public_key: PublicKey) -> Fallible<()> {
    match config {
        Config::V2 { settings, .. } => {
            let zerotier_identity = Identity::read_default()?;

            let data = ZTData {
                email: settings.admin.email.clone(),
                holochain_agent_id: holochain_public_key,
                zerotier_address: zerotier_identity.address.clone(),
                holoport_url: get_holoport_url(holochain_public_key),
            };

            let zerotier_keypair: Keypair = zerotier_identity.try_into()?;
            let data_bytes = serde_json::to_vec(&data)?;
            let zerotier_signature = zerotier_keypair.sign(&data_bytes[..]);
            let url = format!("{}/v1/zt_registration", env::var("AUTH_SERVER_URL")?);
            let resp = CLIENT
                .post(url)
                .json(&ZTPayload {
                    data,
                    signature: base64::encode(&zerotier_signature.to_bytes()[..]),
                })
                .send()
                .await?;
            if let Err(e) = resp.error_for_status_ref() {
                return Err(AuthError::ZtRegistrationError(e.to_string()).into());
            }
            info!("auth-server response: {:?}", resp);
            File::create(zt_auth_done_notification_path())?;
        }
        Config::V1 { .. } => return Err(AuthError::ConfigVersionError.into()),
    }
    Ok(())
}

#[derive(Debug, Serialize)]
struct NotifyPayload {
    email: String,
    success: bool,
    data: String,
}
async fn send_failure_email(email: String, data: String) -> Fallible<()> {
    info!("Sending Failure Email to: {:?}", email);
    send_email(email, data, false).await
}
async fn send_email(email: String, data: String, success: bool) -> Fallible<()> {
    let payload = NotifyPayload {
        email,
        success,
        data,
    };
    let url = format!("{}/v1/notify", env::var("AUTH_SERVER_URL")?);
    let resp = CLIENT.post(url).json(&payload).send().await?;
    info!("Response from email: {:?}", &resp);
    let promise: PostmarkPromise = resp.json().await?;
    info!("Postmark message ID: {}", promise.message_id);
    Ok(())
}

#[derive(Debug, Serialize)]
struct Registration {
    registration_code: String,
    #[serde(serialize_with = "serialize_holochain_agent_pub_key")]
    agent_pub_key: PublicKey,
    email: String,
    payload: RegistrationPayload,
}
#[derive(Debug, Serialize)]
struct RegistrationPayload {
    role: String,
}
#[derive(Debug, Serialize, Deserialize)]
struct RegistrationRequest {
    mem_proof: String,
}

#[allow(non_snake_case)]
#[derive(Debug, Serialize, Deserialize)]
struct RegistrationError {
    error: String,
    isDisplayedToUser: bool,
    info: String,
}

impl fmt::Display for RegistrationError {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "Error: {}, More Info: {}", self.error, self.info)
    }
}

async fn try_registration_auth(config: &Config, holochain_public_key: PublicKey) -> Fallible<()> {
    match config {
        Config::V2 {
            registration_code,
            settings,
            ..
        } => {
            let email = settings.admin.email.clone();
            let payload = Registration {
                registration_code: registration_code.clone(),
                agent_pub_key: holochain_public_key,
                email: email.clone(),
                payload: RegistrationPayload {
                    role: "host".to_string(),
                },
            };
            let mem_proof_server_url = format!("{}/register-user/", mem_proof_server_url());
            let resp = CLIENT
                .post(mem_proof_server_url)
                .json(&payload)
                .send()
                .await?;
            match resp.error_for_status_ref() {
                Ok(_) => {
                    let reg: RegistrationRequest = resp.json().await?;
                    println!("Registration completed message ID: {:?}", reg);
                    // save mem-proofs into a file on the hpos
                    let mut file = File::create(mem_proof_path())?;
                    file.write_all(reg.mem_proof.as_bytes())?;
                }
                Err(_) => {
                    let err: RegistrationError = resp.json().await?;
                    send_failure_email(email, err.to_string()).await?;
                    return Err(AuthError::RegistrationError(err.to_string()).into());
                }
            }
        }
        Config::V1 { settings, .. } => {
            send_failure_email(
                settings.admin.email.clone(),
                AuthError::ConfigVersionError.to_string(),
            )
            .await?;
            return Err(AuthError::ConfigVersionError.into());
        }
    }
    Ok(())
}

fn zt_should_exec() -> bool {
    match env::var("ZT_STATUS") {
        Ok(pass) => {
            if pass == "ACCESS_DENIED" {
                true
            } else {
                false
            }
        }
        _ => false,
    }
}

#[tokio::main]
async fn main() -> Fallible<()> {
    let subscriber = FmtSubscriber::builder()
        .with_env_filter(EnvFilter::from_default_env())
        .finish();

    tracing::subscriber::set_global_default(subscriber)?;

    // Check if the holoport is in the right state before proceeding
    if let Err(e) = init_validation().await {
        error!("Initialization Failed: {}", e);
        return Err(e);
    }

    let config = get_hpos_config()?;
    let password = device_bundle_password();
    let holochain_public_key =
        hpos_config_seed_bundle_explorer::holoport_public_key(&config, password).await?;
    // Get mem-proof by registering on the ops-console
    if !Path::new(&mem_proof_path()).exists() {
        if let Err(e) = try_registration_auth(&config, holochain_public_key).await {
            error!("{}", e);
            return Err(e);
        }
    }
    // Register on zerotier
    if zt_should_exec() {
        let mut backoff = Duration::from_secs(1);
        fs::remove_file(zt_auth_done_notification_path()).ok();
        loop {
            match try_zerotier_auth(&config, holochain_public_key).await {
                Ok(()) => break,
                Err(e) => error!("{}", e),
            }
            info!("retrying registration on ZT..");
            thread::sleep(backoff);
            backoff += backoff;
        }
    }
    Ok(())
}
