use super::AuthError;
use failure::*;
use holochain_types::dna::AgentPubKey;
use std::env;
use std::fs;
use tracing::*;

fn device_bundle_password() -> Option<String> {
    match env::var("DEVICE_SEED_DEFAULT_PASSWORD") {
        Ok(pass) => Some(pass),
        _ => None,
    }
}

// Read the hp-* file and get the device_bundle pub_key
async fn get_key_from_config() -> Fallible<AgentPubKey> {
    // Use agent key from from the config file in main net
    if let Ok(config_json) = fs::read(&"/run/hpos-init/hp-*.json") {
        let config: hpos_config_core::Config = serde_json::from_slice(&config_json).unwrap();
        let pub_key = hpos_config_seed_bundle_explorer::holoport_public_key(
            &config,
            device_bundle_password(),
        )
        .await
        .unwrap();
        let key = AgentPubKey::from_raw_32(pub_key.to_bytes().to_vec());
        info!("hp-* config key: {:?}", key);
        return Ok(key);
    }
    Err(AuthError::InitializationError("Unable to read config hp-*.json".to_string()).into())
}

// Gets the pub_key that is been used in holochain conductor
async fn get_key_from_stored_file() -> Option<AgentPubKey> {
    if let Ok(pubkey_path) = env::var("PUBKEY_PATH") {
        if let Ok(key_vec) = fs::read(&pubkey_path) {
            if let Ok(key) = AgentPubKey::from_raw_39(key_vec) {
                info!("Stored file key: {:?}", key);
                return Some(key);
            }
        }
    }
    None
}

// Check if the holoport is in the right state before proceeding
pub async fn init_validation() -> Fallible<()> {
    if let Ok(holo_network) = env::var("HOLO_NETWORK") {
        if holo_network == "devNet" {
            return Ok(());
        }
    }
    // Getting pub_key that is stored and used in the holochain conductor
    let stored_pub_key = get_key_from_stored_file().await;
    match stored_pub_key {
        Some(spk) => {
            // Getting the pub key from the hp-*.json file itself
            let config_pub_key = get_key_from_config().await?;
            if spk == config_pub_key {
                // the two keys are the same its safe to proceed with holo-auth
                Ok(())
            } else {
                // if they are not we stop the process
                Err(AuthError::InitializationError(
                    "Keys on holoport does not match. Please reset your holoport".to_string(),
                )
                .into())
            }
        }
        // When the stored pub_key is not found its because the holoport was wiped and its safe to proceed
        None => Ok(()),
    }
}
