use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Emitter};

static NEXT_ID: AtomicU64 = AtomicU64::new(1);
static JOBS_LOCK: OnceLock<Mutex<HashMap<u64, DownloadJob>>> = OnceLock::new();

fn jobs_map() -> &'static Mutex<HashMap<u64, DownloadJob>> {
    JOBS_LOCK.get_or_init(|| Mutex::new(HashMap::new()))
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct DownloadJob {
    pub id: u64,
    pub url: String,
    pub dest: String,
    pub status: String,
    pub progress: u8,
}

#[tauri::command]
pub fn list_downloads() -> Result<Vec<DownloadJob>, String> {
    let jobs = jobs_map().lock().map_err(|e| e.to_string())?;
    Ok(jobs.values().cloned().collect())
}

#[tauri::command]
pub async fn add_download(app: AppHandle, url: String, dest: String) -> Result<u64, String> {
    let id = NEXT_ID.fetch_add(1, Ordering::Relaxed);
    let job = DownloadJob {
        id,
        url: url.clone(),
        dest: dest.clone(),
        status: "queued".to_string(),
        progress: 0,
    };

    {
        let mut jobs = jobs_map().lock().map_err(|e| e.to_string())?;
        jobs.insert(id, job.clone());
    }

    // Spawn a simulated worker that emits progress events. Replace with real download logic later.
    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        for p in (1u8..=100u8).step_by(5) {
            {
                if let Ok(mut jobs) = jobs_map().lock() {
                    if let Some(j) = jobs.get_mut(&id) {
                        j.progress = p;
                        j.status = "downloading".to_string();
                    }
                }
            }
            let _ = handle.emit("download:progress", serde_json::json!({ "id": id, "progress": p }));
            tokio::time::sleep(std::time::Duration::from_millis(300)).await;
        }

        // mark complete
        {
            if let Ok(mut jobs) = jobs_map().lock() {
                if let Some(j) = jobs.get_mut(&id) {
                    j.progress = 100;
                    j.status = "completed".to_string();
                }
            }
        }
        let _ = handle.emit("download:finished", serde_json::json!({ "id": id }));
    });

    Ok(id)
}

#[tauri::command]
pub fn pause_download(_app: AppHandle, id: u64) -> Result<(), String> {
    let mut jobs = jobs_map().lock().map_err(|e| e.to_string())?;
    if let Some(j) = jobs.get_mut(&id) {
        j.status = "paused".to_string();
        Ok(())
    } else {
        Err("Job not found".to_string())
    }
}

#[tauri::command]
pub fn resume_download(_app: AppHandle, id: u64) -> Result<(), String> {
    let mut jobs = jobs_map().lock().map_err(|e| e.to_string())?;
    if let Some(j) = jobs.get_mut(&id) {
        j.status = "downloading".to_string();
        Ok(())
    } else {
        Err("Job not found".to_string())
    }
}

#[tauri::command]
pub fn cancel_download(_app: AppHandle, id: u64) -> Result<(), String> {
    let mut jobs = jobs_map().lock().map_err(|e| e.to_string())?;
    if jobs.remove(&id).is_some() {
        Ok(())
    } else {
        Err("Job not found".to_string())
    }
}
