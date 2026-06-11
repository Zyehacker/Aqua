use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Settings {
    pub username: String,
    pub version: String,
    pub loader_type: String,
    pub fabric_loader_version: Option<String>,
    pub java_path: Option<String>,
    pub java_runtime: Option<String>,
    pub mc_dir: Option<String>,
    pub ram_mb: u32,
    pub jvm_args: String,
    pub show_snapshots: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            username: "AquaPlayer".into(),
            version: "1.20.1".into(),
            loader_type: "vanilla".into(),
            fabric_loader_version: None,
            java_path: None,
            java_runtime: None,
            mc_dir: None,
            ram_mb: 2048,
            jvm_args: "-XX:+UnlockExperimentalVMOptions -XX:+UseG1GC -XX:G1NewSizePercent=20 -XX:G1ReservePercent=20 -XX:MaxGCPauseMillis=50 -XX:G1HeapRegionSize=16M -XX:+ParallelRefProcEnabled -XX:+AlwaysPreTouch -XX:+DisableExplicitGC".into(),
            show_snapshots: false,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct JvmSuggestion {
    pub recommended_ram_mb: u32,
    pub recommended_args: String,
    pub memory_mb: u64,
    pub cores: usize,
}

fn settings_path(app: &AppHandle) -> PathBuf {
    let dir = app.path().app_config_dir().expect("could not resolve app config dir");
    let _ = std::fs::create_dir_all(&dir);
    dir.join("settings.json")
}

pub fn home_dir() -> Option<PathBuf> {
    if cfg!(windows) {
        std::env::var_os("USERPROFILE").map(PathBuf::from)
    } else {
        std::env::var_os("HOME").map(PathBuf::from)
    }
}

pub fn default_mc_dir() -> Option<PathBuf> {
    if cfg!(target_os = "windows") {
        std::env::var_os("APPDATA").map(|p| PathBuf::from(p).join(".aquaclient"))
    } else if cfg!(target_os = "macos") {
        home_dir().map(|h| h.join("Library/Application Support/aquaclient"))
    } else {
        home_dir().map(|h| h.join(".aquaclient"))
    }
}

pub fn instance_dir(aqua_dir: &std::path::Path, profile_id: &str) -> PathBuf {
    aqua_dir.join("instances").join(profile_id)
}

fn read_total_memory_mb() -> u64 {
    if cfg!(target_os = "linux") {
        if let Ok(contents) = std::fs::read_to_string("/proc/meminfo") {
            for line in contents.lines() {
                if let Some(rest) = line.strip_prefix("MemTotal:") {
                    let kb = rest.split_whitespace().find_map(|v| v.parse::<u64>().ok()).unwrap_or(0);
                    if kb > 0 {
                        return kb / 1024;
                    }
                }
            }
        }
    }
    8192
}

fn available_cores() -> usize {
    std::thread::available_parallelism().map(|n| n.get()).unwrap_or(4)
}

fn gen_args_from_specs() -> JvmSuggestion {
    let memory_mb = read_total_memory_mb();
    let cores = available_cores();

    let mut recommended_ram_mb = ((memory_mb as f32) * 0.50) as u32;
    recommended_ram_mb = recommended_ram_mb.clamp(1536, 8192);
    if memory_mb <= 4096 {
        recommended_ram_mb = 1536.max((memory_mb as u32) / 2);
    } else if memory_mb <= 8192 {
        recommended_ram_mb = 3072.max((memory_mb as u32) / 2);
    }

    let mut args = vec![
        "-XX:+UnlockExperimentalVMOptions",
        "-XX:+UseG1GC",
        "-XX:G1NewSizePercent=20",
        "-XX:G1ReservePercent=20",
        "-XX:MaxGCPauseMillis=50",
        "-XX:G1HeapRegionSize=16M",
        "-XX:+ParallelRefProcEnabled",
        "-XX:+AlwaysPreTouch",
        "-XX:+DisableExplicitGC",
        "-XX:+PerfDisableSharedMem",
    ];

    if cores >= 6 {
        args.push("-XX:ConcGCThreads=2");
        args.push("-XX:ParallelGCThreads=4");
    }

    JvmSuggestion {
        recommended_ram_mb,
        recommended_args: args.join(" "),
        memory_mb,
        cores,
    }
}

#[tauri::command]
pub fn generate_optimal_args() -> JvmSuggestion {
    gen_args_from_specs()
}

#[tauri::command]
pub fn get_settings(app: AppHandle) -> Settings {
    let path = settings_path(&app);
    if let Ok(data) = std::fs::read_to_string(&path) {
        if let Ok(s) = serde_json::from_str::<Settings>(&data) {
            return s;
        }
    }
    Settings::default()
}

#[tauri::command]
pub fn save_settings(app: AppHandle, settings: Settings) -> Result<(), String> {
    let path = settings_path(&app);
    let data = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    std::fs::write(&path, data).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_default_mc_dir() -> Option<String> {
    default_mc_dir().and_then(|p| p.to_str().map(String::from))
}

#[tauri::command]
pub fn list_versions(mc_dir: Option<String>) -> Vec<String> {
    let dir = mc_dir.map(PathBuf::from).or_else(default_mc_dir);
    let Some(dir) = dir else { return vec![] };
    let versions_dir = dir.join("versions");
    let Ok(entries) = std::fs::read_dir(&versions_dir) else { return vec![] };

    let mut versions: Vec<String> = entries
        .flatten()
        .filter_map(|entry| {
            let p = entry.path();
            if !p.is_dir() {
                return None;
            }
            let id = entry.file_name().to_string_lossy().to_string();
            let json = p.join(format!("{id}.json"));
            let jar = p.join(format!("{id}.jar"));
            if json.exists() || jar.exists() {
                Some(id)
            } else {
                None
            }
        })
        .collect();

    versions.sort();
    versions.dedup();
    versions
}

pub fn app_timestamp() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}
