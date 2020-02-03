use std::{env, fs};

use ed25519_dalek::*;
use hpos_config_core::{Config, public_key};
use serde::*;
use uuid::Uuid;
use zerotier::Identity;

use failure::*;
use tracing::*;
use tracing_subscriber::{EnvFilter, FmtSubscriber};

fn serialize_holochain_agent_id<S>(public_key: &PublicKey, serializer: S) -> Result<S::Ok, S::Error>
where
    S: Serializer,
{
    serializer.serialize_str(&public_key::to_base36_id(&public_key))
}

#[derive(Debug, Deserialize)]
struct PostmarkPromise {
    #[serde(rename = "MessageID")]
    message_id: Uuid
}

#[derive(Debug, Serialize)]
struct Payload {
    email: String,
    #[serde(serialize_with = "serialize_holochain_agent_id")]
    holochain_agent_id: PublicKey,
    zerotier_address: zerotier::Address
}

#[tokio::main]
async fn main() -> Fallible<()> {
    let subscriber = FmtSubscriber::builder()
        .with_env_filter(EnvFilter::from_default_env())
        .finish();

    tracing::subscriber::set_global_default(subscriber)?;

    let config_path = env::var("HPOS_CONFIG_PATH")?;
    let config_json = fs::read(config_path)?;
    let Config::V1 { seed, settings, .. } = serde_json::from_slice(&config_json)?;

    let holochain_secret_key = SecretKey::from_bytes(&seed)?;
    let holochain_public_key = PublicKey::from(&holochain_secret_key);

    let zerotier_identity = Identity::read_default()?;

    let client = reqwest::Client::new();

    let payload = Payload {
        email: settings.admin.email,
        holochain_agent_id: holochain_public_key,
        zerotier_address: zerotier_identity.address,
    };

    let resp = client.post("https://auth-server.holo.host/v1/challenge")
        .json(&payload)
        .send()
        .await?;

    let promise: PostmarkPromise = resp.json().await?;

    info!("Postmark message ID: {}", promise.message_id);

    Ok(())
}
