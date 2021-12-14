use ed25519_dalek::*;
use failure::*;
use hpos_config_core::{public_key, Config};
use lazy_static::*;
use reqwest::Client;
use serde::*;
use std::path::Path;
use std::time::Duration;
use std::{env, fmt, fs, fs::File, io::Write, thread};
use tracing::*;
use tracing_subscriber::{EnvFilter, FmtSubscriber};
use uuid::Uuid;
use zerotier_api::Identity;

lazy_static! {
    static ref CLIENT: Client = Client::new();
}

fn serialize_holochain_agent_id<S>(public_key: &PublicKey, serializer: S) -> Result<S::Ok, S::Error>
where
    S: Serializer,
{
    serializer.serialize_str(&public_key::to_base36_id(&public_key))
}

fn serialize_holochain_agent_pub_key<S>(
    public_key: &PublicKey,
    serializer: S,
) -> Result<S::Ok, S::Error>
where
    S: Serializer,
{
    serializer.serialize_str(&public_key::to_holochain_encoded_agent_key(&public_key))
}

#[derive(Debug, Deserialize)]
struct PostmarkPromise {
    #[serde(rename = "MessageID")]
    message_id: Uuid,
}

#[derive(Debug, Serialize)]
struct Payload {
    email: String,
    #[serde(serialize_with = "serialize_holochain_agent_id")]
    holochain_agent_id: PublicKey,
    zerotier_address: zerotier_api::Address,
}

#[derive(Debug, Fail)]
pub enum AuthError {
    #[fail(display = "Error: Invalid config version used. please upgrade to hpos-config v2")]
    ConfigVersionError,
    #[fail(display = "Registration Error: {}", _0)]
    RegistrationError(String),
}

fn get_hpos_config() -> Fallible<Config> {
    let config_path = env::var("HPOS_CONFIG_PATH")?;
    let config_json = fs::read(config_path)?;
    let config: Config = serde_json::from_slice(&config_json)?;
    Ok(config)
}

async fn try_zerotier_auth(config: &Config, holochain_public_key: PublicKey) -> Fallible<()> {
    match config {
        Config::V2 { settings, .. } => {
            let zerotier_identity = Identity::read_default()?;
            let payload = Payload {
                email: settings.admin.email.clone(),
                holochain_agent_id: holochain_public_key,
                zerotier_address: zerotier_identity.address,
            };
            let resp = CLIENT
                .post("https://auth-server.holo.host/v1/challenge")
                .json(&payload)
                .send()
                .await?;
            let promise: PostmarkPromise = resp.json().await?;
            info!("Postmark message ID: {}", promise.message_id);
        }
        Config::V1 { .. } => return Err(AuthError::ConfigVersionError.into()),
    }
    Ok(())
}

#[derive(Debug, Serialize)]
struct NotifyPayload {
    email: String,
    error: String,
}
async fn send_failure_email(email: String, error: String) -> Fallible<()> {
    let payload = NotifyPayload { email, error };
    info!("Sending Failure Email to: {:?}", &payload.email);
    let resp = CLIENT
        .post("https://auth-server.holo.host/v1/notify")
        .json(&payload)
        .send()
        .await?;
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

fn mem_proof_path() -> String {
    match env::var("MEM_PROOF_PATH") {
        Ok(path) => path,
        _ => "/var/lib/configure-holochain/mem-proof".to_string(),
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

            let resp = CLIENT
                .post("https://holo-registration-service.holo.host/register-user/")
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

#[tokio::main]
async fn main() -> Fallible<()> {
    let subscriber = FmtSubscriber::builder()
        .with_env_filter(EnvFilter::from_default_env())
        .finish();

    tracing::subscriber::set_global_default(subscriber)?;
    let config = get_hpos_config()?;
    let password = match env::var("DEVICE_BUNDLE_PASSWORD") {
        Ok(pass) => Some(pass),
        _ => None,
    };
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
    let mut backoff = Duration::from_secs(1);
    loop {
        match try_zerotier_auth(&config, holochain_public_key).await {
            Ok(()) => break,
            Err(e) => error!("{}", e),
        }
        thread::sleep(backoff);
        backoff += backoff;
    }
    Ok(())
}
