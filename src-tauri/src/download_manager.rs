use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};
use tokio_util::sync::CancellationToken;

static NEXT_ID: AtomicU64 = AtomicU64::new(1);
static JOBS_LOCK: OnceLock<Mutex<HashMap<u64, DownloadJob>>> = OnceLock::new();
static CANCEL_TOKENS: OnceLock<Mutex<HashMap<u64, CancellationToken>>> = OnceLock::new();
static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();

fn jobs_map() -> &'static Mutex<HashMap<u64, DownloadJob>> {
    JOBS_LOCK.get_or_init(|| Mutex::new(HashMap::new()))
}

fn cancel_tokens() -> &'static Mutex<HashMap<u64, CancellationToken>> {
    CANCEL_TOKENS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn client() -> &'static reqwest::Client {
    CLIENT.get_or_init(|| reqwest::Client::new())
}

fn current_time() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs()
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct DownloadJob {
    pub id: u64,
    pub name: String,
    pub url: String,
    pub dest: String,
    pub status: String, // queued, downloading, installing, completed, failed, cancelled
    pub downloaded_bytes: u64,
    pub total_bytes: Option<u64>,
    pub percentage: Option<f64>,
    pub speed: Option<String>,
    pub error: Option<String>,
    pub created_at: u64,
    pub updated_at: u64,
}

#[tauri::command]
pub fn list_downloads() -> Result<Vec<DownloadJob>, String> {
    cleanup_stale_parts();
    let jobs = jobs_map().lock().map_err(|e| e.to_string())?;
    Ok(jobs.values().cloned().collect())
}

fn cleanup_stale_parts() {
    let active: std::collections::HashSet<PathBuf> = jobs_map()
        .lock()
        .ok()
        .map(|jobs| {
            jobs.values()
                .filter(|job| {
                    matches!(job.status.as_str(), "queued" | "downloading" | "installing")
                })
                .map(|job| PathBuf::from(&job.dest).with_extension("part"))
                .collect()
        })
        .unwrap_or_default();
    let Some(root) = crate::settings::default_mc_dir() else {
        return;
    };
    let cutoff = std::time::SystemTime::now()
        .checked_sub(std::time::Duration::from_secs(60 * 60))
        .unwrap_or(std::time::SystemTime::UNIX_EPOCH);
    fn visit(
        dir: &std::path::Path,
        active: &std::collections::HashSet<PathBuf>,
        cutoff: std::time::SystemTime,
    ) {
        let Ok(entries) = std::fs::read_dir(dir) else {
            return;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                visit(&path, active, cutoff);
                continue;
            }
            if path.extension().and_then(|ext| ext.to_str()) != Some("part")
                || active.contains(&path)
            {
                continue;
            }
            if std::fs::metadata(&path)
                .and_then(|meta| meta.modified())
                .map(|modified| modified < cutoff)
                .unwrap_or(false)
            {
                let _ = std::fs::remove_file(path);
            }
        }
    }
    visit(&root, &active, cutoff);
}

#[tauri::command]
pub async fn add_download(app: AppHandle, url: String, dest: String) -> Result<u64, String> {
    let id = NEXT_ID.fetch_add(1, Ordering::Relaxed);
    let name = PathBuf::from(&dest)
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| "Unknown".to_string());

    let now = current_time();
    let job = DownloadJob {
        id,
        name,
        url: url.clone(),
        dest: dest.clone(),
        status: "queued".to_string(),
        downloaded_bytes: 0,
        total_bytes: None,
        percentage: None,
        speed: None,
        error: None,
        created_at: now,
        updated_at: now,
    };

    {
        let mut jobs = jobs_map().lock().map_err(|e| e.to_string())?;
        jobs.insert(id, job.clone());
    }

    let _ = app.emit("download-status", &job);

    let token = CancellationToken::new();
    {
        let mut tokens = cancel_tokens().lock().map_err(|e| e.to_string())?;
        tokens.insert(id, token.clone());
    }

    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        let update_status = |status: &str, error: Option<String>| {
            if let Ok(mut jobs) = jobs_map().lock() {
                if let Some(j) = jobs.get_mut(&id) {
                    j.status = status.to_string();
                    if error.is_some() {
                        j.error = error;
                    }
                    j.updated_at = current_time();
                    let _ = handle.emit("download-status", &j.clone());
                }
            }
        };

        update_status("downloading", None);

        let dest_path = PathBuf::from(&dest);
        if let Some(parent) = dest_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }

        let temp_path = if dest_path.extension().and_then(|ext| ext.to_str()) == Some("part") {
            let name = dest_path
                .file_name()
                .map(|name| name.to_string_lossy().to_string())
                .unwrap_or_else(|| "download.part".to_string());
            dest_path.with_file_name(format!(".{}.download", name.trim_start_matches('.')))
        } else {
            let ext = dest_path
                .extension()
                .map(|ext| ext.to_string_lossy().to_string())
                .unwrap_or_else(|| "part".to_string());
            dest_path.with_extension(format!("{ext}.part"))
        };

        let response = match client().get(&url).send().await {
            Ok(r) => r,
            Err(e) => {
                let _ = std::fs::remove_file(&temp_path);
                update_status("failed", Some(e.to_string()));
                return;
            }
        };

        if !response.status().is_success() {
            let _ = std::fs::remove_file(&temp_path);
            update_status("failed", Some(format!("HTTP error: {}", response.status())));
            return;
        }

        let total_size = response.content_length();
        {
            if let Ok(mut jobs) = jobs_map().lock() {
                if let Some(j) = jobs.get_mut(&id) {
                    j.total_bytes = total_size;
                    j.updated_at = current_time();
                }
            }
        }

        let mut file = match std::fs::File::create(&temp_path) {
            Ok(f) => f,
            Err(e) => {
                let _ = std::fs::remove_file(&temp_path);
                update_status("failed", Some(e.to_string()));
                return;
            }
        };

        use std::io::Write;
        let mut stream = response.bytes_stream();
        let mut downloaded: u64 = 0;
        let start_time = std::time::Instant::now();
        let mut last_update = std::time::Instant::now();

        loop {
            tokio::select! {
                _ = token.cancelled() => {
                    update_status("cancelled", None);
                    let _ = std::fs::remove_file(&temp_path);
                    return;
                }
                chunk = stream.next() => {
                    match chunk {
                        Some(Ok(bytes)) => {
                            if let Err(e) = file.write_all(&bytes) {
                                let _ = std::fs::remove_file(&temp_path);
                                update_status("failed", Some(e.to_string()));
                                return;
                            }
                            downloaded += bytes.len() as u64;

                            if last_update.elapsed().as_millis() >= 200 {
                                let elapsed_s = start_time.elapsed().as_secs_f64();
                                let speed = if elapsed_s > 0.0 {
                                    Some(format!("{:.1} MB/s", (downloaded as f64 / 1_048_576.0) / elapsed_s))
                                } else {
                                    None
                                };
                                let pct = total_size.map(|t| (downloaded as f64 / t as f64) * 100.0);

                                if let Ok(mut jobs) = jobs_map().lock() {
                                    if let Some(j) = jobs.get_mut(&id) {
                                        j.downloaded_bytes = downloaded;
                                        j.percentage = pct;
                                        j.speed = speed;
                                        j.updated_at = current_time();
                                        let _ = handle.emit("download-status", &j.clone());
                                    }
                                }
                                last_update = std::time::Instant::now();
                            }
                        }
                        Some(Err(e)) => {
                            let _ = std::fs::remove_file(&temp_path);
                            update_status("failed", Some(e.to_string()));
                            return;
                        }
                        None => {
                            break; // stream ended
                        }
                    }
                }
            }
        }

        // Finish up
        if let Err(e) = std::fs::rename(&temp_path, &dest_path) {
            update_status("failed", Some(e.to_string()));
            return;
        }

        if let Ok(mut jobs) = jobs_map().lock() {
            if let Some(j) = jobs.get_mut(&id) {
                j.downloaded_bytes = downloaded;
                j.percentage = Some(100.0);
                j.speed = None;
                j.status = "completed".to_string();
                j.updated_at = current_time();
                let _ = handle.emit("download-status", &j.clone());
            }
        }
    });

    Ok(id)
}

#[tauri::command]
pub fn pause_download(_app: AppHandle, _id: u64) -> Result<(), String> {
    Err("Pause not natively supported by this basic stream yet.".to_string())
}

#[tauri::command]
pub fn resume_download(_app: AppHandle, _id: u64) -> Result<(), String> {
    Err("Resume not natively supported yet.".to_string())
}

#[tauri::command]
pub fn cancel_download(app: AppHandle, id: u64) -> Result<(), String> {
    let token = {
        let mut tokens = cancel_tokens().lock().map_err(|e| e.to_string())?;
        tokens.remove(&id)
    };

    if let Some(t) = token {
        t.cancel();
    }

    // Fallback direct status update just in case
    if let Ok(mut jobs) = jobs_map().lock() {
        if let Some(j) = jobs.get_mut(&id) {
            if j.status == "queued" || j.status == "downloading" {
                j.status = "cancelled".to_string();
                j.updated_at = current_time();
                let _ = app.emit("download-status", &j.clone());
            }
            Ok(())
        } else {
            Err("Job not found".to_string())
        }
    } else {
        Err("Failed to lock jobs".to_string())
    }
}
