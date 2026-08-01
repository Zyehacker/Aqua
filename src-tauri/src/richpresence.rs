use std::sync::{Arc, Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

use discord_rich_presence::{
    activity::{Activity, Assets, Timestamps},
    DiscordIpc, DiscordIpcClient,
};
use tauri::{AppHandle, Emitter};

const APP_ID: &str = "1492837024153997382";

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
        .assets(Assets::new().large_image("aqua").large_text("Aqua Client"))
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
        .assets(
            Assets::new()
                .large_image("minecraft")
                .large_text("Minecraft")
                .small_image("aqua")
                .small_text("Aqua Client"),
        )
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

    let activity_key = format!("multiplayer:{}", server_name);
    if state.last_activity.as_deref() == Some(activity_key.as_str()) {
        return Ok(());
    }

    let details = format!("Playing {}", server_name);

    let activity = Activity::new()
        .details(details.as_str())
        .state("With Aqua Client")
        .assets(
            Assets::new()
                .large_image("minecraft")
                .large_text("Minecraft")
                .small_image("aqua")
                .small_text("Aqua Client"),
        )
        .timestamps(Timestamps::new().start(state.start_time as i64));

    state.set_activity(activity)?;
    state.last_activity = Some(activity_key);
    log_rpc(&format!("Playing {}", server_name));

    Ok(())
}