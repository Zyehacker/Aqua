use std::sync::{Arc, Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

use discord_rich_presence::{
    activity::{Activity, Assets, Button, Timestamps},
    DiscordIpc, DiscordIpcClient,
};
use tauri::{AppHandle, Emitter};

const APP_ID: &str = "1492837024153997382";
const DISCORD_INVITE_URL: &str = "https://discord.gg/aeavxn8BAe";
const KOFI_URL: &str = "https://ko-fi.com/Zyehacker";
const AQUA_ASSET: &str = "aqua";
const MINECRAFT_ASSET: &str = "minecraft";

struct KnownServer {
    display_name: &'static str,
    domains: &'static [&'static str],
    large_image: &'static str,
}

const KNOWN_SERVERS: &[KnownServer] = &[
    KnownServer { display_name: "Hypixel", domains: &["hypixel.net"], large_image: "server_hypixel" },
    KnownServer { display_name: "MCC Island", domains: &["mccisland.net"], large_image: "server_mcc_island" },
    KnownServer { display_name: "Mineplex", domains: &["mineplex.com", "mineplex.eu"], large_image: "server_mineplex" },
    KnownServer { display_name: "The Hive", domains: &["hivebedrock.network", "playhive.com"], large_image: "server_hive" },
    KnownServer { display_name: "CubeCraft", domains: &["cubecraft.net"], large_image: "server_cubecraft" },
    KnownServer { display_name: "Wynncraft", domains: &["wynncraft.com"], large_image: "server_wynncraft" },
    KnownServer { display_name: "GommeHD", domains: &["gommehd.net"], large_image: "server_gommehd" },
    KnownServer { display_name: "JartexNetwork", domains: &["jartexnetwork.com"], large_image: "server_jartex" },
    KnownServer { display_name: "BlocksMC", domains: &["blocksmc.com"], large_image: "server_blocksmc" },
    KnownServer { display_name: "TheArchon", domains: &["thearchon.net"], large_image: "server_archon" },
];

fn normalize_server_address(address: &str) -> Option<String> {
    let mut value = address.trim().trim_end_matches('.').to_ascii_lowercase();
    if let Some((host, port)) = value.rsplit_once(':') {
        if port.parse::<u16>().is_ok() { value = host.to_string(); }
    }
    while value.ends_with('.') { value.pop(); }
    (!value.is_empty() && !value.contains('/') && !value.contains('@')).then_some(value)
}

fn known_server(address: &str) -> Option<&'static KnownServer> {
    let host = normalize_server_address(address)?;
    KNOWN_SERVERS.iter().find(|server| server.domains.iter().any(|domain| host == *domain || host.ends_with(&format!(".{domain}"))))
}

fn activity_buttons() -> Vec<Button<'static>> {
    vec![Button::new("Download Aqua Client", DISCORD_INVITE_URL), Button::new("Support Us", KOFI_URL)]
}

fn minecraft_assets(large_image: &'static str, large_text: &'static str) -> Assets<'static> {
    Assets::new()
        .large_image(large_image)
        .large_text(large_text)
        .small_image(AQUA_ASSET)
        .small_text("Aqua Client")
}

struct RpcState {
    client: Option<DiscordIpcClient>,
    started: bool,
    start_time: u64,
    last_activity: Option<String>,
}

impl RpcState {
    fn new() -> Self {
        Self {
            client: None,
            started: false,
            start_time: current_timestamp(),
            last_activity: None,
        }
    }

    fn connect(&mut self) -> bool {
        if self.client.is_some() {
            return true;
        }

        match DiscordIpcClient::new(APP_ID) {
            Ok(mut client) => match client.connect() {
                Ok(_) => {
                    self.client = Some(client);
                    self.started = true;
                    self.start_time = current_timestamp();
                    true
                }
                Err(e) => {
                    crate::settings::append_launcher_log(
                        "warn",
                        "rpc",
                        &format!("Failed to connect to Discord: {}", e),
                    );
                    false
                }
            },
            Err(e) => {
                crate::settings::append_launcher_log(
                    "warn",
                    "rpc",
                    &format!("Failed to create Discord client: {}", e),
                );
                false
            }
        }
    }

    fn set_activity(&mut self, activity: Activity) -> Result<(), String> {
        if self.client.is_none() {
            if !self.connect() {
                return Ok(());
            }
        }

        if let Some(ref mut client) = self.client {
            match client.set_activity(activity) {
                Ok(_) => Ok(()),
                Err(e) => {
                    crate::settings::append_launcher_log(
                        "warn",
                        "rpc",
                        &format!("Failed to set activity: {}", e),
                    );
                    self.client = None;
                    Ok(())
                }
            }
        } else {
            Ok(())
        }
    }

    fn disconnect(&mut self) -> Result<(), String> {
        if let Some(mut client) = self.client.take() {
            let _ = client.clear_activity();
            let _ = client.close();
        }

        self.started = false;
        self.last_activity = None;
        Ok(())
    }
}

static RPC_STATE: OnceLock<Arc<Mutex<RpcState>>> = OnceLock::new();

fn rpc_state() -> Arc<Mutex<RpcState>> {
    Arc::clone(RPC_STATE.get_or_init(|| Arc::new(Mutex::new(RpcState::new()))))
}

fn current_timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn log_rpc(message: &str) {
    crate::settings::append_launcher_log("info", "rpc", &format!("[RPC] {}", message));
}

#[tauri::command]
pub fn start_rich_presence(app: AppHandle) -> Result<(), String> {
    let state_arc = rpc_state();
    let mut state = state_arc
        .lock()
        .map_err(|_| "Failed to acquire RPC state")?;

    if state.started {
        return Ok(());
    }

    if state.connect() {
        log_rpc("Connected");
        let _ = app.emit(
            "richpresence-started",
            serde_json::json!({
                "application_id": APP_ID
            }),
        );
    } else {
        state.started = true;
        log_rpc("Not connected (Discord not running)");
    }

    Ok(())
}

#[tauri::command]
pub fn stop_rich_presence(app: AppHandle) -> Result<(), String> {
    let state_arc = rpc_state();
    let mut state = state_arc
        .lock()
        .map_err(|_| "Failed to acquire RPC state")?;

    if !state.started {
        return Ok(());
    }

    state.disconnect()?;
    log_rpc("Disconnected");

    let _ = app.emit("richpresence-stopped", serde_json::json!({}));

    Ok(())
}

#[tauri::command]
pub fn set_idle_presence() -> Result<(), String> {
    let state_arc = rpc_state();
    let mut state = state_arc
        .lock()
        .map_err(|_| "Failed to acquire RPC state")?;

    if !state.started {
        return Ok(());
    }

    let activity_key = "idle";
    if state.last_activity.as_deref() == Some(activity_key) {
        return Ok(());
    }

    let activity = Activity::new()
        .details("Browsing Aqua Client")
        .state("Ready to Play")
        .assets(Assets::new().large_image(AQUA_ASSET).large_text("Aqua Client"))
        .buttons(activity_buttons())
        .timestamps(Timestamps::new().start(state.start_time as i64));

    state.set_activity(activity)?;
    state.last_activity = Some(activity_key.to_string());
    log_rpc("Idle");

    Ok(())
}

#[tauri::command]
pub fn set_singleplayer_presence(version: String) -> Result<(), String> {
    let state_arc = rpc_state();
    let mut state = state_arc
        .lock()
        .map_err(|_| "Failed to acquire RPC state")?;

    if !state.started {
        return Ok(());
    }

    let activity_key = format!("singleplayer:{}", version);
    if state.last_activity.as_deref() == Some(activity_key.as_str()) {
        return Ok(());
    }

    let activity = Activity::new()
        .details("Playing Minecraft")
        .state("With Aqua Client")
        .assets(minecraft_assets(MINECRAFT_ASSET, "Minecraft"))
        .buttons(activity_buttons())
        .timestamps(Timestamps::new().start(state.start_time as i64));

    state.set_activity(activity)?;
    state.last_activity = Some(activity_key);
    log_rpc(&format!("Playing Minecraft ({})", version));

    Ok(())
}

#[tauri::command]
pub fn set_multiplayer_presence(server_name: String) -> Result<(), String> {
    let state_arc = rpc_state();
    let mut state = state_arc
        .lock()
        .map_err(|_| "Failed to acquire RPC state")?;

    if !state.started {
        return Ok(());
    }

    let server = known_server(&server_name);
    let display_name = server.map(|value| value.display_name).unwrap_or("Multiplayer");
    let large_image = server.map(|value| value.large_image).unwrap_or(MINECRAFT_ASSET);
    let activity_key = format!("multiplayer:{}", normalize_server_address(&server_name).unwrap_or_else(|| "unknown".to_string()));
    if state.last_activity.as_deref() == Some(activity_key.as_str()) {
        return Ok(());
    }

    let details = format!("Playing {} with Aqua Client", display_name);

    let activity = Activity::new()
        .details(details.as_str())
        .state("With Aqua Client")
        .assets(
            Assets::new()
                .large_image(large_image)
                .large_text(display_name)
                .small_image(AQUA_ASSET)
                .small_text("Aqua Client"),
        )
        .buttons(activity_buttons())
        .timestamps(Timestamps::new().start(state.start_time as i64));

    state.set_activity(activity)?;
    state.last_activity = Some(activity_key);
    log_rpc(&format!("Server detected: {}; RPC updated", display_name));

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{known_server, normalize_server_address};

    #[test]
    fn normalizes_server_host_and_port() {
        assert_eq!(normalize_server_address(" MC.HYPIXEL.NET:25565. "), Some("mc.hypixel.net".to_string()));
        assert_eq!(normalize_server_address("127.0.0.1:25565"), Some("127.0.0.1".to_string()));
    }

    #[test]
    fn matches_known_server_subdomains_without_broad_substring_matching() {
        assert_eq!(known_server("play.hypixel.net:25565").map(|server| server.display_name), Some("Hypixel"));
        assert!(known_server("not hypixel.net.example").is_none());
    }
}