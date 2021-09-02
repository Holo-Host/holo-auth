use std::time::Duration;
use std::{env, fmt, fs, thread};

use ed25519_dalek::*;
use hpos_config_core::{public_key, Config};
use serde::*;
use uuid::Uuid;
use zerotier::Identity;

use failure::*;
use lazy_static::*;
use reqwest::Client;
use tracing::*;
use tracing_subscriber::{EnvFilter, FmtSubscriber};

lazy_static! {
    static ref CLIENT: Client = Client::new();
}

fn serialize_holochain_agent_id<S>(public_key: &PublicKey, serializer: S) -> Result<S::Ok, S::Error>
where
    S: Serializer,
{
    serializer.serialize_str(&public_key::to_base36_id(&public_key))
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
    zerotier_address: zerotier::Address,
}

#[derive(Debug, Fail)]
pub enum AuthError {
    #[fail(display = "Invalid config version used. please upgrade to hpos-config v2")]
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

async fn try_zerotier_auth() -> Fallible<()> {
    let config = get_hpos_config()?;
    let holochain_public_key = config.holoport_public_key()?;
    match config {
        Config::V2 { settings, .. } => {
            let zerotier_identity = Identity::read_default()?;
            let payload = Payload {
                email: settings.admin.email,
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
struct RegistrationPayload {
    registration_code: String,
    #[serde(serialize_with = "serialize_holochain_agent_id")]
    agent_pub_key: PublicKey,
    email: String,
    role: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct RegistrationRequest {
    mem_proof: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct RegistrationError {
    error: String,
    info: String,
}

impl fmt::Display for RegistrationError {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "Error: {}, More Info: {}", self.error, self.info)
    }
}

async fn try_registration_auth() -> Fallible<()> {
    let config = get_hpos_config()?;
    let holochain_public_key = config.holoport_public_key()?;
    match config {
        Config::V2 {
            registration_code,
            settings,
            ..
        } => {
            let email = settings.admin.email;
            let payload = RegistrationPayload {
                registration_code: registration_code,
                agent_pub_key: holochain_public_key,
                email: email.clone(),
                role: "host".to_string(),
            };

            let resp = CLIENT
                .post("http://holo-registration-service.holo.host/register-user/")
                .json(&payload)
                .send()
                .await?;
            match resp.error_for_status_ref() {
                Ok(_) => {
                    let reg: RegistrationRequest = resp.json().await?;
                    println!("Registration completed message ID: {:?}", reg);
                    //TODO: save mem-proofs into a file on the hpos
                }
                Err(_) => {
                    let err: RegistrationError = resp.json().await?;
                    send_failure_email(email, err.to_string()).await?;
                    return Err(AuthError::RegistrationError(err.to_string()).into());
                }
            }
        }
        Config::V1 { .. } => return Err(AuthError::ConfigVersionError.into()),
    }
    Ok(())
}

#[tokio::main]
async fn main() -> Fallible<()> {
    let subscriber = FmtSubscriber::builder()
        .with_env_filter(EnvFilter::from_default_env())
        .finish();

    tracing::subscriber::set_global_default(subscriber)?;
    // TODO: REVERT TO trying zerotier after registration
    let mut backoff = Duration::from_secs(1); // 5 mins
    loop {
        match try_zerotier_auth().await {
            Ok(()) => break,
            Err(e) => error!("{}", e),
        }

        thread::sleep(backoff);
        backoff += backoff;
    }
    backoff = Duration::from_secs(300);
    loop {
        match try_registration_auth().await {
            Ok(()) => break,
            Err(e) => error!("{}", e),
        }
        thread::sleep(backoff);
        backoff += backoff;
    }

    Ok(())
}
