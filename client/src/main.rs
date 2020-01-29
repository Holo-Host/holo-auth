use std::{env, fs};

use ed25519_dalek::*;
use failure::*;
use hpos_config_core::{Config, public_key};
use reqwest::Client;
use serde::*;
use zerotier::Identity;

fn serialize_holochain_agent_id<S>(public_key: &PublicKey, serializer: S) -> Result<S::Ok, S::Error>
where
    S: Serializer,
{
    serializer.serialize_str(&public_key::to_base36_id(&public_key))
}

#[derive(Debug, Serialize)]
struct Payload {
    email: String,
    #[serde(serialize_with = "serialize_holochain_agent_id")]
    holochain_agent_id: PublicKey,
    zerotier_address: zerotier::Address
}

fn main() -> Fallible<()> {
    let config_path = env::var("HPOS_CONFIG_PATH")?;
    let config_json = fs::read(config_path)?;
    let Config::V1 { seed, settings, .. } = serde_json::from_slice(&config_json)?;

    let holochain_secret_key = SecretKey::from_bytes(&seed)?;
    let holochain_public_key = PublicKey::from(&holochain_secret_key);

    let zerotier_identity = Identity::read_default()?;

    let payload = Payload {
        email: settings.admin.email,
        holochain_agent_id: holochain_public_key,
        zerotier_address: zerotier_identity.address,
    };

    let payload_bytes = serde_json::to_vec(&payload)?;

    Client::new()
        .post("https://auth-server.holo.host/v1/challenge")
        .body(payload_bytes)
        .send()?;

    Ok(())
}
