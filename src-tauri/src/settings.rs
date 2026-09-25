use std::io::Write;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Settings {
    #[serde(default = "default_language")]
    pub language: String,
    pub username: String,
    pub version: String,
    pub loader_type: String,
    pub fabric_loader_version: Option<String>,
    pub java_path: Option<String>,
    pub java_runtime: Option<String>,
    pub mc_dir: Option<String>,
    #[serde(default)]
    pub instance_id: Option<String>,
    /// One-shot multiplayer target supplied by the Home server join action.
    /// It is not persisted by save_settings; it only travels through a launch request.
    #[serde(default, skip_serializing)]
    pub server_address: Option<String>,
    #[serde(default, skip_serializing)]
    pub server_port: Option<u16>,
    #[serde(default)]
    pub offline_mode: bool,
    #[serde(default = "default_offline_profile_name")]
    pub offline_profile_name: String,
    #[serde(default)]
    pub offline_profiles: Vec<OfflineProfile>,
    #[serde(default)]
    pub active_offline_profile_id: Option<String>,
    #[serde(default)]
    pub confirm_before_launch: bool,
    #[serde(default = "default_resolution_width")]
    pub resolution_width: u32,
    #[serde(default = "default_resolution_height")]
    pub resolution_height: u32,
    #[serde(default)]
    pub fullscreen: bool,
    pub ram_mb: u32,
    pub jvm_args: String,
    #[serde(default = "default_performance_profile")]
    pub performance_profile: String,
    pub show_snapshots: bool,
    #[serde(default = "default_minimize_on_launch")]
    pub minimize_on_launch: bool,
    #[serde(default = "default_quick_startup")]
    pub quick_startup: bool,
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

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct OfflineProfile {
    pub id: String,
    pub name: String,
}

fn default_minimize_on_launch() -> bool {
    true
}

fn default_quick_startup() -> bool {
    true
}

fn default_language() -> String {
    "en".to_string()
}

fn default_performance_profile() -> String {
    "balanced".to_string()
}

fn default_offline_profile_name() -> String {
    "Aqua_Player".to_string()
}

fn default_resolution_width() -> u32 { 854 }
fn default_resolution_height() -> u32 { 480 }

impl Default for Settings {
    fn default() -> Self {
        Self {
            language: default_language(),
            username: "Player".into(),
            version: "1.21.11".into(),
            loader_type: "vanilla".into(),
            fabric_loader_version: None,
            java_path: None,
            java_runtime: None,
            mc_dir: None,
            instance_id: None,
            server_address: None,
            server_port: None,
            offline_mode: false,
            offline_profile_name: default_offline_profile_name(),
            offline_profiles: vec![OfflineProfile { id: "default-offline".to_string(), name: default_offline_profile_name() }],
            active_offline_profile_id: Some("default-offline".to_string()),
            confirm_before_launch: false,
            resolution_width: default_resolution_width(),
            resolution_height: default_resolution_height(),
            fullscreen: false,
            ram_mb: 2048,
            jvm_args: "-XX:+UnlockExperimentalVMOptions -XX:+UseG1GC -XX:G1NewSizePercent=20 -XX:G1ReservePercent=20 -XX:MaxGCPauseMillis=50 -XX:G1HeapRegionSize=16M -XX:+ParallelRefProcEnabled -XX:+AlwaysPreTouch -XX:+DisableExplicitGC".into(),
            performance_profile: default_performance_profile(),
            show_snapshots: false,
            minimize_on_launch: true,
            quick_startup: true,
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

#[derive(Serialize, Clone, Debug)]
pub struct HardwareInfo {
    pub cpu: String,
    pub cores: usize,
    pub memory_mb: u64,
    pub gpu: String,
    pub operating_system: String,
    pub classification: String,
    pub explanation: String,
}

#[tauri::command]
pub fn detect_hardware() -> HardwareInfo {
    let cores = available_cores();
    let memory_mb = read_total_memory_mb();
    let cpu = std::env::var("PROCESSOR_IDENTIFIER")
        .or_else(|_| std::env::var("HOSTTYPE"))
        .unwrap_or_else(|_| "Unknown CPU".to_string());
    let gpu = std::env::var("GPU")
        .unwrap_or_else(|_| "GPU details unavailable".to_string());
    let operating_system = std::env::consts::OS.to_string();
    let classification = if memory_mb <= 8192 || cores <= 4 {
        "low".to_string()
    } else if memory_mb <= 16384 || cores <= 8 {
        "mid".to_string()
    } else {
        "high".to_string()
    };
    let explanation = format!(
        "Classified from {memory_mb} MB physical memory and {cores} logical CPU threads; GPU-specific telemetry is unavailable."
    );
    HardwareInfo { cpu, cores, memory_mb, gpu, operating_system, classification, explanation }
}

fn settings_path(app: &AppHandle) -> PathBuf {
    let dir = app
        .path()
        .app_config_dir()
        .expect("could not resolve app config dir");
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

pub fn atomic_write(path: &PathBuf, data: &[u8]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let temporary = path.with_extension(format!(
        "{}.{}.{}.tmp",
        path.extension()
            .and_then(|ext| ext.to_str())
            .unwrap_or("json"),
        std::process::id(),
        app_timestamp()
    ));
    {
        let mut file = std::fs::File::create(&temporary).map_err(|e| e.to_string())?;
        use std::io::Write;
        file.write_all(data).map_err(|e| e.to_string())?;
        file.sync_all().map_err(|e| e.to_string())?;
    }
    #[cfg(windows)]
    {
        use std::os::windows::ffi::OsStrExt;
        let source: Vec<u16> = temporary
            .as_os_str()
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();
        let destination: Vec<u16> = path
            .as_os_str()
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();
        unsafe extern "system" {
            fn MoveFileExW(existing: *const u16, replacement: *const u16, flags: u32) -> i32;
        }
        const MOVEFILE_REPLACE_EXISTING: u32 = 0x1;
        const MOVEFILE_WRITE_THROUGH: u32 = 0x8;
        if unsafe {
            MoveFileExW(
                source.as_ptr(),
                destination.as_ptr(),
                MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
            )
        } == 0
        {
            let error = std::io::Error::last_os_error();
            let _ = std::fs::remove_file(&temporary);
            return Err(error.to_string());
        }
        return Ok(());
    }
    #[cfg(not(windows))]
    std::fs::rename(&temporary, path).map_err(|e| {
        let _ = std::fs::remove_file(&temporary);
        e.to_string()
    })
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
    let kit_profiles = aqua_dir
        .join("aqua_blobs")
        .join("profiles")
        .join(profile_id);
    let profiles = aqua_dir.join("profiles").join(profile_id);
    let legacy = aqua_dir.join("instances").join(profile_id);

    // Metadata is authoritative. An empty directory in the preferred layout
    // must not shadow a valid profile stored in a compatibility layout.
    if kit_profiles.join("instance.json").is_file() {
        kit_profiles
    } else if profiles.join("instance.json").is_file() {
        profiles
    } else if legacy.join("instance.json").is_file() {
        legacy
    } else if kit_profiles.exists() {
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
        if let Ok(mut f) = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&path)
        {
            let entry = serde_json::json!({
                "timestamp": app_timestamp(),
                "level": level,
                "source": source,
                "message": message,
            });
            let _ = writeln!(f, "{}", entry.to_string());
        }
        rotate_logs(&dir, &path);
    }
}

/// Append a structured game log entry to the current game session file.
#[allow(dead_code)]
pub fn append_game_log(stream: &str, line: &str) {
    if let Some(dir) = game_logs_dir() {
        let _ = std::fs::create_dir_all(&dir);
        let fname = format!("session_{}.log", app_timestamp());
        let path = dir.join(fname);
        if let Ok(mut f) = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&path)
        {
            let entry = serde_json::json!({
                "timestamp": app_timestamp(),
                "stream": stream,
                "line": line,
            });
            let _ = writeln!(f, "{}", entry.to_string());
        }
        rotate_logs(&dir, &path);
    }
}

fn rotate_logs(dir: &PathBuf, active: &PathBuf) {
    let cutoff = SystemTime::now()
        .checked_sub(std::time::Duration::from_secs(30 * 24 * 60 * 60))
        .unwrap_or(SystemTime::UNIX_EPOCH);
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path == *active || path.extension().and_then(|ext| ext.to_str()) != Some("log") {
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

#[tauri::command]
pub fn read_logs() -> Result<String, String> {
    let mut paths = Vec::new();
    if let Some(dir) = launcher_logs_dir() {
        if let Ok(entries) = std::fs::read_dir(dir) {
            paths.extend(
                entries
                    .flatten()
                    .filter_map(|entry| entry.path().is_file().then_some(entry.path())),
            );
        }
    }
    if let Some(dir) = game_logs_dir() {
        if let Ok(entries) = std::fs::read_dir(dir) {
            paths.extend(
                entries
                    .flatten()
                    .filter_map(|entry| entry.path().is_file().then_some(entry.path())),
            );
        }
    }
    paths.sort();
    const MAX_FILE_BYTES: usize = 512 * 1024;
    const MAX_TOTAL_BYTES: usize = 4 * 1024 * 1024;
    let mut output = String::new();
    for path in paths {
        if output.len() >= MAX_TOTAL_BYTES {
            break;
        }
        if let Ok(bytes) = std::fs::read(&path) {
            let start = bytes.len().saturating_sub(MAX_FILE_BYTES);
            let content = String::from_utf8_lossy(&bytes[start..]);
            let remaining = MAX_TOTAL_BYTES - output.len();
            output.extend(content.chars().take(remaining));
        }
    }
    Ok(output)
}

fn open_path(path: &std::path::Path) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(path)
            .spawn()
            .map_err(|error| error.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(path)
            .spawn()
            .map_err(|error| error.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(path)
            .spawn()
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn all_log_paths() -> Vec<PathBuf> {
    [launcher_logs_dir(), game_logs_dir()]
        .into_iter()
        .flatten()
        .flat_map(|dir| {
            std::fs::read_dir(dir)
                .into_iter()
                .flatten()
                .flatten()
                .map(|entry| entry.path())
                .filter(|path| path.is_file())
                .collect::<Vec<_>>()
        })
        .collect()
}

#[tauri::command]
pub fn open_latest_log() -> Result<(), String> {
    let path = all_log_paths()
        .into_iter()
        .max_by_key(|path| std::fs::metadata(path).and_then(|meta| meta.modified()).ok())
        .ok_or_else(|| "No log file is available yet.".to_string())?;
    open_path(&path)
}

#[tauri::command]
pub fn open_logs_folder() -> Result<(), String> {
    let path = launcher_logs_dir().ok_or_else(|| "Could not determine the logs directory.".to_string())?;
    open_path(&path)
}

fn read_total_memory_mb() -> u64 {
    if cfg!(target_os = "linux") {
        if let Ok(contents) = std::fs::read_to_string("/proc/meminfo") {
            for line in contents.lines() {
                if let Some(rest) = line.strip_prefix("MemTotal:") {
                    let kb = rest
                        .split_whitespace()
                        .find_map(|v| v.parse::<u64>().ok())
                        .unwrap_or(0);
                    if kb > 0 {
                        return kb / 1024;
                    }
                }
            }
        }
    }
    #[cfg(windows)]
    {
        #[repr(C)]
        struct MemoryStatus {
            length: u32,
            memory_load: u32,
            total_physical: u64,
            available_physical: u64,
            total_page_file: u64,
            available_page_file: u64,
            total_virtual: u64,
            available_virtual: u64,
            available_extended_virtual: u64,
        }
        extern "system" {
            fn GlobalMemoryStatusEx(status: *mut MemoryStatus) -> i32;
        }
        let mut status = MemoryStatus {
            length: std::mem::size_of::<MemoryStatus>() as u32,
            memory_load: 0,
            total_physical: 0,
            available_physical: 0,
            total_page_file: 0,
            available_page_file: 0,
            total_virtual: 0,
            available_virtual: 0,
            available_extended_virtual: 0,
        };
        if unsafe { GlobalMemoryStatusEx(&mut status) } != 0 && status.total_physical > 0 {
            return status.total_physical / (1024 * 1024);
        }
    }
    #[cfg(target_os = "macos")]
    {
        if let Ok(output) = std::process::Command::new("sysctl")
            .args(["-n", "hw.memsize"])
            .output()
        {
            if let Ok(value) = String::from_utf8(output.stdout) {
                if let Ok(bytes) = value.trim().parse::<u64>() {
                    return bytes / (1024 * 1024);
                }
            }
        }
    }
    8192
}

fn available_cores() -> usize {
    std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(4)
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

fn merge_settings_with_defaults(raw: Settings) -> Settings {
    let mut merged = Settings::default();
    merged.language = if raw.language.trim().is_empty() { merged.language } else { raw.language };
    merged.username = if raw.username.trim().is_empty() { merged.username } else { raw.username };
    merged.version = if raw.version.trim().is_empty() { merged.version } else { raw.version };
    merged.loader_type = if raw.loader_type.trim().is_empty() { merged.loader_type } else { raw.loader_type };
    merged.fabric_loader_version = raw.fabric_loader_version;
    merged.java_path = raw.java_path;
    merged.java_runtime = raw.java_runtime;
    merged.mc_dir = raw.mc_dir;
    merged.instance_id = raw.instance_id;
    merged.offline_mode = raw.offline_mode;
    merged.offline_profile_name = if raw.offline_profile_name.trim().is_empty() {
        merged.offline_profile_name
    } else {
        raw.offline_profile_name
    };
    merged.offline_profiles = raw.offline_profiles;
    merged.active_offline_profile_id = raw.active_offline_profile_id;
    merged.confirm_before_launch = raw.confirm_before_launch;
    merged.resolution_width = if raw.resolution_width == 0 { merged.resolution_width } else { raw.resolution_width };
    merged.resolution_height = if raw.resolution_height == 0 { merged.resolution_height } else { raw.resolution_height };
    merged.fullscreen = raw.fullscreen;
    merged.ram_mb = if raw.ram_mb == 0 { merged.ram_mb } else { raw.ram_mb };
    merged.jvm_args = if raw.jvm_args.trim().is_empty() { merged.jvm_args } else { raw.jvm_args };
    merged.performance_profile = if raw.performance_profile.trim().is_empty() { merged.performance_profile } else { raw.performance_profile };
    merged.show_snapshots = raw.show_snapshots;
    merged.minimize_on_launch = raw.minimize_on_launch;
    merged.quick_startup = raw.quick_startup;
    merged.window_x = raw.window_x.or(merged.window_x);
    merged.window_y = raw.window_y.or(merged.window_y);
    merged.window_width = raw.window_width.or(merged.window_width);
    merged.window_height = raw.window_height.or(merged.window_height);
    merged.window_maximized = raw.window_maximized.or(merged.window_maximized);
    merged
}

#[tauri::command]
pub fn get_settings(app: AppHandle) -> Settings {
    let path = settings_path(&app);
    if let Ok(data) = std::fs::read_to_string(&path) {
        if let Ok(s) = serde_json::from_str::<Settings>(&data) {
            return merge_settings_with_defaults(s);
        }
    }
    Settings::default()
}

#[tauri::command]
pub fn save_settings(app: AppHandle, settings: Settings) -> Result<(), String> {
    if settings.offline_profiles.len() > 2 {
        return Err("Offline account limit reached (2/2).".to_string());
    }
    let mut names = std::collections::HashSet::new();
    for profile in &settings.offline_profiles {
        let key = profile.name.trim().to_lowercase();
        if !names.insert(key) {
            return Err("An offline account with this name already exists.".to_string());
        }
    }
    let path = settings_path(&app);
    let normalized = merge_settings_with_defaults(settings);
    let data = serde_json::to_string_pretty(&normalized).map_err(|e| e.to_string())?;
    atomic_write(&path, data.as_bytes())
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
    let Ok(entries) = std::fs::read_dir(&versions_dir) else {
        return vec![];
    };

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
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn settings_normalization_preserves_supported_values_after_round_trip() {
        let settings = Settings {
            offline_mode: true,
            offline_profile_name: "Builder".to_string(),
            offline_profiles: vec![OfflineProfile { id: "builder".to_string(), name: "Builder".to_string() }],
            active_offline_profile_id: Some("builder".to_string()),
            confirm_before_launch: true,
            resolution_width: 1920,
            resolution_height: 1080,
            fullscreen: true,
            window_maximized: Some(true),
            ..Settings::default()
        };

        let encoded = serde_json::to_string(&merge_settings_with_defaults(settings.clone())).unwrap();
        let restored = merge_settings_with_defaults(serde_json::from_str(&encoded).unwrap());

        assert_eq!(restored.offline_mode, settings.offline_mode);
        assert_eq!(restored.offline_profile_name, settings.offline_profile_name);
        assert_eq!(restored.offline_profiles, settings.offline_profiles);
        assert_eq!(restored.active_offline_profile_id, settings.active_offline_profile_id);
        assert_eq!(restored.confirm_before_launch, settings.confirm_before_launch);
        assert_eq!(restored.resolution_width, settings.resolution_width);
        assert_eq!(restored.resolution_height, settings.resolution_height);
        assert_eq!(restored.fullscreen, settings.fullscreen);
        assert_eq!(restored.window_maximized, settings.window_maximized);
    }
}
