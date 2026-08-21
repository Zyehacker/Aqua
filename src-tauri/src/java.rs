use std::fs::{self, File};
use std::io;
use std::path::{Path, PathBuf};
use std::process::Command;

use flate2::read::GzDecoder;
use tar::Archive;
use tauri::{AppHandle, Manager};
use zip::ZipArchive;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct JavaRuntime {
    pub path: String,
    pub version: String,
    pub major_version: u32,
    pub vendor: String,
    pub architecture: String,
    pub valid: bool,
    pub compatible: bool,
}

fn parse_java_version(output: &str) -> (u32, String, String, String) {
    let mut major = 0;
    let mut version = String::new();
    let mut vendor = "Unknown Vendor".to_string();
    let mut arch = "x86_64".to_string();

    let lines: Vec<&str> = output.lines().collect();
    if let Some(first_line) = lines.first() {
        if first_line.to_lowercase().contains("openjdk") {
            vendor = "OpenJDK".to_string();
        } else if first_line.to_lowercase().contains("java(tm)") {
            vendor = "Oracle".to_string();
        }
        
        if let Some(start) = first_line.find('"') {
            if let Some(end) = first_line[start + 1..].find('"') {
                let v = &first_line[start + 1..start + 1 + end];
                version = v.to_string();
                
                let parts: Vec<&str> = v.split('.').collect();
                if parts[0] == "1" && parts.len() > 1 {
                    major = parts[1].parse().unwrap_or(0);
                } else {
                    major = parts[0].parse().unwrap_or(0);
                }
            }
        }
    }
    
    for line in &lines {
        let l = line.to_lowercase();
        if l.contains("temurin") {
            vendor = "Adoptium (Temurin)".to_string();
        } else if l.contains("corretto") {
            vendor = "Amazon Corretto".to_string();
        } else if l.contains("zulu") {
            vendor = "Azul Zulu".to_string();
        }
        
        if l.contains("64-bit") {
            arch = "64-bit".to_string();
        } else if l.contains("32-bit") {
            arch = "32-bit".to_string();
        }
    }

    (major, version, vendor, arch)
}

pub fn get_required_java_major(mc_version: &str) -> u32 {
    let parts: Vec<&str> = mc_version.split('.').collect();
    if parts.len() >= 2 {
        if let Ok(minor) = parts[1].parse::<u32>() {
            if minor <= 16 {
                return 8;
            } else if minor == 17 {
                return 16;
            } else if minor >= 18 && minor <= 20 {
                return 17;
            } else if minor >= 21 {
                return 21;
            }
        }
    }
    21
}

pub fn get_required_java_major_from_metadata(mc_version: &str, metadata: &serde_json::Value) -> u32 {
    metadata
        .get("javaVersion")
        .and_then(|java| java.get("majorVersion"))
        .and_then(|major| major.as_u64())
        .map(|major| major as u32)
        .unwrap_or_else(|| get_required_java_major(mc_version))
}

pub fn check_java_runtime(path: &Path, mc_version: Option<&str>) -> Option<JavaRuntime> {
    if !path.exists() {
        return None;
    }
    
    // Using creation of NoWindow is possible, but let's just use it safely. On windows std::process::Command does flash if used in GUI app,
    // but Tauri configures windows subsystem so it usually shouldn't.
    #[cfg(windows)]
    use std::os::windows::process::CommandExt;
    
    let mut cmd = Command::new(path);
    cmd.arg("-version");
    
    #[cfg(windows)]
    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    
    let output = cmd.output().ok()?;
    if !output.status.success() {
        return None;
    }
    
    let stderr = String::from_utf8_lossy(&output.stderr);
    let (major, version, vendor, arch) = parse_java_version(&stderr);
    if major == 0 {
        return None;
    }
    
    let mut compatible = true;
    if let Some(mc_v) = mc_version {
        let required = get_required_java_major(mc_v);
        compatible = major >= required;
    }

    Some(JavaRuntime {
        path: path.to_string_lossy().to_string(),
        version,
        major_version: major,
        vendor,
        architecture: arch,
        valid: true,
        compatible,
    })
}

fn find_java_in_dir(dir: &Path, runtimes: &mut std::collections::HashSet<PathBuf>) {
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() {
                let bin = p.join("bin").join("java.exe");
                if bin.exists() {
                    runtimes.insert(bin);
                }
            }
        }
    }
}

pub fn discover_system_java(mc_version: Option<String>) -> Vec<JavaRuntime> {
    let mut paths = std::collections::HashSet::new();
    
    if let Ok(jh) = std::env::var("JAVA_HOME") {
        let p = PathBuf::from(jh).join("bin").join("java.exe");
        if p.exists() {
            paths.insert(p);
        }
    }
    
    if let Ok(path_env) = std::env::var("PATH") {
        for split in path_env.split(';') {
            let p = PathBuf::from(split).join("java.exe");
            if p.exists() {
                paths.insert(p);
            }
        }
    }
    
    let common_dirs = [
        "C:\\Program Files\\Java",
        "C:\\Program Files (x86)\\Java",
        "C:\\Program Files\\Eclipse Adoptium",
        "C:\\Program Files\\Amazon Corretto",
        "C:\\Program Files\\Zulu",
        "C:\\Program Files\\BellSoft",
    ];
    
    for dir in common_dirs {
        find_java_in_dir(Path::new(dir), &mut paths);
    }
    
    let mut results = Vec::new();
    let mc_v = mc_version.as_deref();
    
    for p in paths {
        if let Some(jr) = check_java_runtime(&p, mc_v) {
            results.push(jr);
        }
    }
    
    results.sort_by(|a, b| b.major_version.cmp(&a.major_version));
    
    // deduplicate by path
    let mut unique = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for r in results {
        if seen.insert(r.path.clone()) {
            unique.push(r);
        }
    }
    
    unique
}

#[tauri::command]
pub async fn list_java_runtimes(mc_version: Option<String>) -> Result<Vec<JavaRuntime>, String> {
    Ok(discover_system_java(mc_version))
}

fn java_bin_name() -> &'static str {
    if cfg!(windows) { "java.exe" } else { "java" }
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

fn check_java_runtime_major(path: &Path, required_major: u32) -> Option<JavaRuntime> {
    let runtime = check_java_runtime(path, None)?;
    (runtime.major_version == required_major).then_some(runtime)
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

fn temurin_url(major: u32) -> String {
    format!(
        "https://api.adoptium.net/v3/binary/latest/{}/ga/{}/{}/jre/hotspot/normal/eclipse",
        major,
        os_token(),
        arch_token()
    )
}

async fn download_bytes_with_progress(app: &AppHandle, url: &str) -> Result<Vec<u8>, String> {
    let client = reqwest::Client::builder()
        .user_agent("AquaClient/1.0")
        .build()
        .map_err(|e| e.to_string())?;

    let mut response = client.get(url).send().await.map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        return Err(format!("HTTP {} while downloading Java", response.status()));
    }

    let total_size = response.content_length().unwrap_or(0);
    let mut bytes = Vec::new();
    
    while let Some(chunk) = response.chunk().await.map_err(|e| e.to_string())? {
        bytes.extend_from_slice(&chunk);
        if total_size > 0 {
            crate::install::emit_status(
                app,
                "java",
                "Downloading Java Runtime...",
                bytes.len() as u64,
                total_size
            );
        }
    }
    
    Ok(bytes)
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

async fn install_temurin(app: &AppHandle, major: u32) -> Result<String, String> {
    let java_root = app_java_dir(app)?.join(format!("temurin-{}", major));
    fs::create_dir_all(&java_root).map_err(|e| e.to_string())?;

    let bytes = download_bytes_with_progress(app, &temurin_url(major)).await?;
    if cfg!(windows) {
        extract_zip(&bytes, &java_root)?;
    } else {
        extract_targz(&bytes, &java_root)?;
    }

    if let Some(found) = find_java_in_tree(&java_root) {
        if let Some(rt) = check_java_runtime(&found, None) {
            if rt.valid {
                return Ok(found.to_string_lossy().to_string());
            }
        }
    }

    if let Ok(entries) = fs::read_dir(&java_root) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                if let Some(found) = find_java_in_tree(&path) {
                    if let Some(rt) = check_java_runtime(&found, None) {
                        if rt.valid {
                            return Ok(found.to_string_lossy().to_string());
                        }
                    }
                }
            }
        }
    }

    Err("Java was downloaded but the executable could not be validated".into())
}

#[tauri::command]
pub async fn ensure_java(
    app: AppHandle,
    configured: Option<String>,
    _java_runtime: Option<String>,
    version: Option<String>,
) -> Result<String, String> {
    let required_major = version
        .as_deref()
        .map(get_required_java_major)
        .unwrap_or(21);
    ensure_java_for_major(app, configured, required_major).await
}

pub async fn ensure_java_for_major(
    app: AppHandle,
    configured: Option<String>,
    required_major: u32,
) -> Result<String, String> {
    if let Some(path) = configured {
        let trimmed = path.trim();
        if !trimmed.is_empty() {
            if check_java_runtime_major(Path::new(trimmed), required_major).is_some() {
                return Ok(trimmed.to_string());
            }
        }
    }

    let runtimes = discover_system_java(None);
    for rt in runtimes {
        if rt.major_version == required_major {
            return Ok(rt.path);
        }
    }

    let java_root = app_java_dir(&app)?.join(format!("temurin-{}", required_major));
    if let Some(found) = find_java_in_tree(&java_root) {
        if check_java_runtime_major(&found, required_major).is_some() {
            return Ok(found.to_string_lossy().to_string());
        }
    }

    install_temurin(&app, required_major).await
}
