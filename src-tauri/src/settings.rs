use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use std::io::Write;

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
    #[serde(default)]
    pub instance_id: Option<String>,
    pub ram_mb: u32,
    pub jvm_args: String,
    pub show_snapshots: bool,
    #[serde(default = "default_minimize_on_launch")]
    pub minimize_on_launch: bool,
    // Optional window state persisted between launches
    #[serde(default)]
    pub window_x: Option<i32>,
    #[serde(default)]
    pub window_y: Option<i32>,
    #[serde(default)]
    pub window_width: Option<u32>,
    #[serde(default)]
    pub window_height: Option<u32>,
    #[serde(default)]
    pub window_maximized: Option<bool>,
}

fn default_minimize_on_launch() -> bool {
    true
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            username: "Player
            ".into(),
            version: "1.21.11".into(),
            loader_type: "vanilla".into(),
            fabric_loader_version: None,
            java_path: None,
            java_runtime: None,
            mc_dir: None,
            instance_id: None,
            ram_mb: 2048,
            jvm_args: "-XX:+UnlockExperimentalVMOptions -XX:+UseG1GC -XX:G1NewSizePercent=20 -XX:G1ReservePercent=20 -XX:MaxGCPauseMillis=50 -XX:G1HeapRegionSize=16M -XX:+ParallelRefProcEnabled -XX:+AlwaysPreTouch -XX:+DisableExplicitGC".into(),
            show_snapshots: false,
            minimize_on_launch: true,
            window_x: None,
            window_y: None,
            window_width: None,
            window_height: None,
            window_maximized: None,
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
    // Prefer KitStorage `aqua_blobs/profiles/<id>` layout, then `profiles/`, then legacy `instances/`.
    let kit_profiles = aqua_dir.join("aqua_blobs").join("profiles").join(profile_id);
    let profiles = aqua_dir.join("profiles").join(profile_id);
    let legacy = aqua_dir.join("instances").join(profile_id);

    if kit_profiles.exists() {
        kit_profiles
    } else if profiles.exists() {
        profiles
    } else if legacy.exists() {
        legacy
    } else {
        // Prefer the KitStorage layout when creating new instances
        kit_profiles
    }
}

/// Ensure the launcher root layout exists and return the path to the launcher root.
pub fn ensure_launcher_layout() -> Option<PathBuf> {
    let root = default_mc_dir()?;
    // Top-level folders recommended by the new layout
    let dirs = [
        // Top-level caches for backward compatibility
        root.join("caches").join("icons"),
        root.join("caches").join("screenshots"),
        root.join("caches").join("thumbnails"),
        root.join("caches").join("avatars"),
        // Legacy launcher logs (kept for backward compatibility)
        root.join("launcher_logs"),
        root.join("launcher_logs").join("archived"),
        // Meta and standard folders
        root.join("meta").join("assets"),
        root.join("meta").join("java_versions"),
        root.join("meta").join("libraries"),
        root.join("meta").join("natives"),
        root.join("meta").join("versions"),
        root.join("meta").join("manifests"),
        root.join("meta").join("log_configs"),
        root.join("profiles"),
        root.join("storage"),
        root.join("databases"),
        root.join("cookies"),
        root.join("localstorage"),
        // KitStorage root
        root.join("aqua_blobs"),
        // KitStorage subfolders (preferred locations)
        root.join("aqua_blobs").join("databases"),
        root.join("aqua_blobs").join("caches").join("icons"),
        root.join("aqua_blobs").join("caches").join("screenshots"),
        root.join("aqua_blobs").join("caches").join("thumbnails"),
        root.join("aqua_blobs").join("caches").join("avatars"),
        root.join("aqua_blobs").join("cookies"),
        root.join("aqua_blobs").join("localstorage"),
        root.join("aqua_blobs").join("storage"),
        root.join("aqua_blobs").join("meta"),
        root.join("aqua_blobs").join("profiles"),
        root.join("aqua_blobs").join("Serializer"),
        root.join("aqua_blobs").join("skins"),
        root.join("aqua_blobs").join("cosmetics"),
        root.join("aqua_blobs").join("logs").join("launcher"),
        root.join("aqua_blobs").join("logs").join("game"),
        root.join("aqua_blobs").join("runtimes").join("java17"),
        root.join("aqua_blobs").join("runtimes").join("java8"),
        // Compatibility: keep legacy folders so existing backend code continues to work
        root.join("versions"),
        root.join("assets"),
        root.join("libraries"),
        root.join("instances"),
    ];

    for d in dirs.iter() {
        let _ = std::fs::create_dir_all(d);
    }

    Some(root)
}

/// Returns the launcher logs directory (ensures layout exists).
pub fn launcher_logs_dir() -> Option<PathBuf> {
    ensure_launcher_layout().map(|r| r.join("aqua_blobs").join("logs").join("launcher"))
}

/// Returns the game logs directory (ensures layout exists).
#[allow(dead_code)]
pub fn game_logs_dir() -> Option<PathBuf> {
    ensure_launcher_layout().map(|r| r.join("aqua_blobs").join("logs").join("game"))
}

/// Append a structured launcher log entry to the current session file. Best-effort - errors are ignored.
pub fn append_launcher_log(level: &str, source: &str, message: &str) {
    if let Some(dir) = launcher_logs_dir() {
        let _ = std::fs::create_dir_all(&dir);
        let fname = format!("session_{}.log", app_timestamp());
        let path = dir.join(fname);
        if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(&path) {
            let entry = serde_json::json!({
                "timestamp": app_timestamp(),
                "level": level,
                "source": source,
                "message": message,
            });
            let _ = writeln!(f, "{}", entry.to_string());
        }
    }
}

/// Append a structured game log entry to the current game session file.
#[allow(dead_code)]
pub fn append_game_log(stream: &str, line: &str) {
    if let Some(dir) = game_logs_dir() {
        let _ = std::fs::create_dir_all(&dir);
        let fname = format!("session_{}.log", app_timestamp());
        let path = dir.join(fname);
        if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(&path) {
            let entry = serde_json::json!({
                "timestamp": app_timestamp(),
                "stream": stream,
                "line": line,
            });
            let _ = writeln!(f, "{}", entry.to_string());
        }
    }
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
