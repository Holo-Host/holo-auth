use std::time::Duration;
use std::{env, fs, thread};

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
}

async fn try_auth() -> Fallible<()> {
    let config_path = env::var("HPOS_CONFIG_PATH")?;
    let config_json = fs::read(config_path)?;
    let config: Config = serde_json::from_slice(&config_json)?; 
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

#[tokio::main]
async fn main() -> Fallible<()> {
    let subscriber = FmtSubscriber::builder()
        .with_env_filter(EnvFilter::from_default_env())
        .finish();

    tracing::subscriber::set_global_default(subscriber)?;

    let mut backoff = Duration::from_secs(1);

    loop {
        match try_auth().await {
            Ok(()) => break,
            Err(e) => error!("{}", e),
        }

        thread::sleep(backoff);
        backoff += backoff;
    }

    Ok(())
}
