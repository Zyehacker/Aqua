use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_updater::UpdaterExt;

use crate::launch::LaunchState;

static IS_UPDATING: AtomicBool = AtomicBool::new(false);

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct UpdateInfo {
    pub current_version: String,
    pub version: String,
    pub body: Option<String>,
    pub date: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct UpdateProgressPayload {
    pub chunk_length: usize,
    pub downloaded_bytes: u64,
    pub total_bytes: Option<u64>,
    pub percent: Option<f64>,
}

#[tauri::command]
pub async fn check_for_update(app: AppHandle) -> Result<Option<UpdateInfo>, String> {
    let updater = app.updater().map_err(|e| e.to_string())?;
    match updater.check().await {
        Ok(Some(update)) => {
            let info = UpdateInfo {
                current_version: update.current_version.clone(),
                version: update.version.clone(),
                body: update.body.clone(),
                date: update.date.map(|d| d.to_string()),
            };
            let _ = app.emit("updater-available", &info);
            Ok(Some(info))
        }
        Ok(None) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub async fn install_update(app: AppHandle) -> Result<(), String> {
    if IS_UPDATING.swap(true, Ordering::SeqCst) {
        return Err("Update is already in progress".to_string());
    }

    let result = run_update_pipeline(&app).await;
    IS_UPDATING.store(false, Ordering::SeqCst);
    result
}

async fn run_update_pipeline(app: &AppHandle) -> Result<(), String> {
    let updater = app.updater().map_err(|e| e.to_string())?;
    let update = match updater.check().await.map_err(|e| e.to_string())? {
        Some(u) => u,
        None => return Err("No update available".to_string()),
    };

    let downloaded_bytes = Arc::new(std::sync::atomic::AtomicU64::new(0));
    let app_handle_chunk = app.clone();
    let downloaded_clone = Arc::clone(&downloaded_bytes);

    let _ = app.emit("updater-download-start", ());

    update
        .download_and_install(
            move |chunk_length, content_length| {
                let current_downloaded = downloaded_clone
                    .fetch_add(chunk_length as u64, Ordering::SeqCst)
                    + chunk_length as u64;
                let percent = content_length.map(|total| {
                    if total > 0 {
                        ((current_downloaded as f64 / total as f64) * 100.0).clamp(0.0, 100.0)
                    } else {
                        0.0
                    }
                });

                let _ = app_handle_chunk.emit(
                    "updater-download-progress",
                    UpdateProgressPayload {
                        chunk_length,
                        downloaded_bytes: current_downloaded,
                        total_bytes: content_length,
                        percent,
                    },
                );
            },
            || {
                // Download finished, verification / unpacking begins
            },
        )
        .await
        .map_err(|e| {
            let err_msg = e.to_string();
            let _ = app.emit("updater-error", &err_msg);
            err_msg
        })?;

    let _ = app.emit("updater-download-complete", ());
    Ok(())
}

#[tauri::command]
pub async fn restart_app(app: AppHandle) -> Result<(), String> {
    app.restart();
}

pub fn start_updater_check_loop(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        // Delay initial startup check slightly to ensure UI is ready
        tokio::time::sleep(Duration::from_secs(3)).await;
        if !minecraft_running(&app) {
            if let Err(err) = check_for_update(app.clone()).await {
                eprintln!("Periodic update check error: {}", err);
            }
        }

        loop {
            tokio::time::sleep(Duration::from_secs(60 * 60 * 6)).await;
            if !minecraft_running(&app) {
                if let Err(err) = check_for_update(app.clone()).await {
                    eprintln!("Periodic update check error: {}", err);
                }
            }
        }
    });
}

fn minecraft_running(app: &AppHandle) -> bool {
    app.try_state::<LaunchState>()
        .and_then(|state| state.running.lock().ok().map(|running| *running))
        .unwrap_or(false)
}
