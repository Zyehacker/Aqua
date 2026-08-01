use std::fs::{self, File};
use std::io;
use std::path::{Path, PathBuf};
use std::process::Command;

use flate2::read::GzDecoder;
use tar::Archive;
use tauri::{AppHandle, Manager};
use zip::ZipArchive;

fn java_bin_name() -> &'static str {
    if cfg!(windows) { "java.exe" } else { "java" }
}

fn java_from_system_path() -> Option<String> {
    let candidates = if cfg!(windows) {
        vec!["java.exe", "java"]
    } else {
        vec!["java"]
    };

    for candidate in candidates {
        if Command::new(candidate).arg("-version").output().is_ok() {
            return Some(candidate.to_string());
        }
    }
    None
}

fn app_java_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?.join("java");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn find_java_in_tree(root: &Path) -> Option<PathBuf> {
    let bin_name = java_bin_name();
    let direct = root.join("bin").join(bin_name);
    if direct.exists() {
        return Some(direct);
    }

    if let Ok(entries) = fs::read_dir(root) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() {
                let nested = p.join("bin").join(bin_name);
                if nested.exists() {
                    return Some(nested);
                }
            }
        }
    }
    None
}

fn is_java_executable(path: &str) -> bool {
    Command::new(path).arg("-version").output().is_ok()
}

fn os_token() -> &'static str {
    if cfg!(windows) {
        "windows"
    } else if cfg!(target_os = "macos") {
        "mac"
    } else {
        "linux"
    }
}

fn arch_token() -> &'static str {
    match std::env::consts::ARCH {
        "x86_64" => "x64",
        "aarch64" => "aarch64",
        "arm" => "arm",
        other => other,
    }
}

fn temurin_url() -> String {
    format!(
        "https://api.adoptium.net/v3/binary/latest/21/ga/{}/{}/jre/hotspot/normal/eclipse",
        os_token(),
        arch_token()
    )
}

async fn download_bytes(url: &str) -> Result<Vec<u8>, String> {
    let client = reqwest::Client::builder()
        .user_agent("AquaClient/1.0")
        .build()
        .map_err(|e| e.to_string())?;

    let response = client.get(url).send().await.map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        return Err(format!("HTTP {} while downloading Java", response.status()));
    }

    let bytes = response.bytes().await.map_err(|e| e.to_string())?;
    Ok(bytes.to_vec())
}

fn extract_zip(bytes: &[u8], out_dir: &Path) -> Result<(), String> {
    let cursor = io::Cursor::new(bytes);
    let mut archive = ZipArchive::new(cursor).map_err(|e| e.to_string())?;

    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
        let outpath = match file.enclosed_name() {
            Some(path) => out_dir.join(path),
            None => continue,
        };

        if file.name().ends_with('/') {
            fs::create_dir_all(&outpath).map_err(|e| e.to_string())?;
        } else {
            if let Some(parent) = outpath.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            let mut outfile = File::create(&outpath).map_err(|e| e.to_string())?;
            io::copy(&mut file, &mut outfile).map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

fn extract_targz(bytes: &[u8], out_dir: &Path) -> Result<(), String> {
    let cursor = io::Cursor::new(bytes);
    let gz = GzDecoder::new(cursor);
    let mut archive = Archive::new(gz);
    archive.unpack(out_dir).map_err(|e| e.to_string())
}

async fn install_temurin(app: &AppHandle) -> Result<String, String> {
    let java_root = app_java_dir(app)?.join("temurin-21");
    fs::create_dir_all(&java_root).map_err(|e| e.to_string())?;

    let bytes = download_bytes(&temurin_url()).await?;
    if cfg!(windows) {
        extract_zip(&bytes, &java_root)?;
    } else {
        extract_targz(&bytes, &java_root)?;
    }

    if let Some(found) = find_java_in_tree(&java_root) {
        return Ok(found.to_string_lossy().to_string());
    }

    if let Ok(entries) = fs::read_dir(&java_root) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                if let Some(found) = find_java_in_tree(&path) {
                    return Ok(found.to_string_lossy().to_string());
                }
            }
        }
    }

    Err("Java was installed but the executable could not be found".into())
}

#[tauri::command]
pub async fn ensure_java(
    app: AppHandle,
    configured: Option<String>,
    _java_runtime: Option<String>,
    _version: Option<String>,
) -> Result<String, String> {
    if let Some(path) = configured {
        let trimmed = path.trim();
        if !trimmed.is_empty() && is_java_executable(trimmed) {
            return Ok(trimmed.to_string());
        }
    }

    if let Some(system_java) = java_from_system_path() {
        return Ok(system_java);
    }

    let java_root = app_java_dir(&app)?;
    if let Some(found) = find_java_in_tree(&java_root) {
        return Ok(found.to_string_lossy().to_string());
    }

    install_temurin(&app).await
}
