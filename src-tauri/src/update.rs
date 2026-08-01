use std::time::Duration;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

pub const CURRENT_VERSION: &str = "1.1.0";
const UPDATE_URL: &str = "https://aqua-proxy.zenchigood.workers.dev/list-releases";

#[derive(Debug, PartialEq, Eq, PartialOrd, Ord, Clone)]
pub struct SemVer {
    pub major: u64,
    pub minor: u64,
    pub patch: u64,
}

impl SemVer {
    pub fn parse(s: &str) -> Option<Self> {
        let s = s.trim().trim_start_matches(|c| c == 'v' || c == 'V');
        let parts: Vec<&str> = s.split('.').collect();
        let major = parts.get(0).and_then(|&x| x.parse::<u64>().ok())?;
        let minor = parts.get(1).and_then(|&x| x.parse::<u64>().ok()).unwrap_or(0);
        let patch = parts.get(2)
            .and_then(|&x| x.split(|c| c == '-' || c == '+').next())
            .and_then(|x| x.parse::<u64>().ok())
            .unwrap_or(0);
        Some(SemVer { major, minor, patch })
    }
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Release {
    #[serde(rename = "fileId")]
    pub file_id: String,
    pub filename: String,
    pub version: String,
    pub ext: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ReleasesResponse {
    pub releases: Vec<Release>,
}

fn current_platform_extension() -> &'static str {
    #[cfg(target_os = "windows")]
    { "msi" }
    #[cfg(target_os = "linux")]
    { "deb" }
    #[cfg(target_os = "macos")]
    { "dmg" }
    #[cfg(not(any(target_os = "windows", target_os = "linux", target_os = "macos")))]
    { "" }
}

pub async fn check_for_updates(app: &AppHandle) -> Result<(), String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client.get(UPDATE_URL)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err(format!("Server returned status: {}", resp.status()));
    }

    let payload: ReleasesResponse = resp.json().await.map_err(|e| e.to_string())?;
    let target_ext = current_platform_extension();
    if target_ext.is_empty() {
        return Ok(());
    }

    let current_semver = SemVer::parse(CURRENT_VERSION).unwrap_or(SemVer { major: 1, minor: 0, patch: 0 });

    for release in payload.releases {
        if release.ext.eq_ignore_ascii_case(target_ext) {
            if let Some(release_semver) = SemVer::parse(&release.version) {
                if release_semver > current_semver {
                    let _ = app.emit("update-available", release);
                    break;
                }
            }
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn download_update(app: AppHandle, file_id: String) -> Result<String, String> {
    let target_ext = current_platform_extension();
    if target_ext.is_empty() {
        return Err("Unsupported platform".to_string());
    }

    let dest_dir = crate::settings::default_mc_dir()
        .ok_or_else(|| "Could not resolve default launcher directory".to_string())?
        .join("updates");
    
    std::fs::create_dir_all(&dest_dir).map_err(|e| e.to_string())?;
    let dest_path = dest_dir.join(format!("update_{}.{}", file_id, target_ext));

    let download_url = format!("https://aqua-proxy.zenchigood.workers.dev/download/{}", file_id);
    
    let client = reqwest::Client::new();
    let mut resp = client.get(&download_url)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err(format!("Download failed: Server returned status {}", resp.status()));
    }

    let total_bytes = resp.content_length().unwrap_or(0);
    let mut downloaded: u64 = 0;
    
    let mut file = std::fs::File::create(&dest_path).map_err(|e| e.to_string())?;

    use std::io::Write;

    while let Some(chunk) = resp.chunk().await.map_err(|e| e.to_string())? {
        file.write_all(&chunk).map_err(|e| e.to_string())?;
        downloaded += chunk.len() as u64;

        let percent = if total_bytes > 0 {
            (downloaded as f64 / total_bytes as f64 * 100.0) as u8
        } else {
            0
        };

        let _ = app.emit("update-download-progress", serde_json::json!({
            "fileId": file_id,
            "downloaded": downloaded,
            "total": total_bytes,
            "percent": percent
        }));
    }

    file.sync_all().map_err(|e| e.to_string())?;

    let _ = app.emit("update-download-complete", serde_json::json!({
        "fileId": file_id,
        "path": dest_path.to_string_lossy().to_string()
    }));

    Ok(dest_path.to_string_lossy().to_string())
}

pub fn start_updater_and_network_tracker(app: AppHandle) {
    // Spawn update checker task
    let update_app = app.clone();
    tauri::async_runtime::spawn(async move {
        loop {
            if let Err(e) = check_for_updates(&update_app).await {
                eprintln!("Update check failed: {}", e);
            }
            tokio::time::sleep(Duration::from_secs(60 * 60 * 24 * 3)).await;
        }
    });

    // Spawn network tracking task
    let network_app = app;
    tauri::async_runtime::spawn(async move {
        let client = match reqwest::Client::builder()
            .timeout(Duration::from_secs(5))
            .build()
        {
            Ok(c) => c,
            Err(_) => return,
        };

        let mut was_online = true;
        loop {
            let is_online = match client.get(UPDATE_URL).send().await {
                Ok(resp) => resp.status().is_success(),
                Err(_) => false,
            };

            if is_online != was_online {
                if is_online {
                    let _ = network_app.emit("network-online", ());
                } else {
                    let _ = network_app.emit("network-offline", ());
                }
                was_online = is_online;
            }

            tokio::time::sleep(Duration::from_secs(10)).await;
        }
    });
}
