use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

use base64::{engine::general_purpose, Engine};
use serde::{Deserialize, Serialize};

use crate::settings::{append_launcher_log, atomic_write, default_mc_dir, instance_dir};
use tauri::{AppHandle, Emitter};
use crate::install::install_version as install_version_cmd;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ModInfo {
    pub filename: String,
    pub size: u64,
    pub enabled: bool,
    pub category: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct StorageIssue {
    pub kind: String,
    pub path: String,
    pub message: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct StorageIntegrityReport {
    pub healthy: bool,
    pub issues: Vec<StorageIssue>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct InstanceInfo {
    pub id: String,
    pub name: String,
    pub mc_version: String,
    pub loader: String,
    pub loader_version: Option<String>,
    pub loader_mode: String,
    pub installed_version_id: String,
    pub game_dir: Option<String>,
    pub java_path: Option<String>,
    #[serde(default)]
    pub java_runtime: Option<String>,
    #[serde(default)]
    pub java_version: Option<String>,
    pub memory_mb: Option<u32>,
    pub java_args: Option<String>,
    pub install_state: Option<String>,
    pub created_at: u64,
    pub updated_at: u64,
    pub last_played_at: Option<u64>,
    pub mod_count: u64,
    pub pack_count: u64,
    pub shader_count: u64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub(crate) struct InstanceMetadata {
    pub id: String,
    pub name: String,
    pub mc_version: String,
    pub loader: String,
    pub loader_version: Option<String>,
    #[serde(default = "default_loader_mode")]
    pub loader_mode: String,
    pub installed_version_id: String,
    pub game_dir: Option<String>,
    pub java_path: Option<String>,
    #[serde(default)]
    pub java_runtime: Option<String>,
    #[serde(default)]
    pub java_version: Option<String>,
    pub memory_mb: Option<u32>,
    pub java_args: Option<String>,
    pub install_state: Option<String>,
    pub created_at: u64,
    pub updated_at: u64,
    pub last_played_at: Option<u64>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct InstanceUpdate {
    pub name: Option<String>,
    pub mc_version: Option<String>,
    pub loader: Option<String>,
    pub loader_version: Option<String>,
    pub loader_mode: Option<String>,
    pub game_dir: Option<String>,
    pub java_path: Option<String>,
    pub java_runtime: Option<String>,
    pub java_version: Option<String>,
    pub memory_mb: Option<u32>,
    pub java_args: Option<String>,
    pub install_state: Option<String>,
}

fn default_loader_mode() -> String {
    "manual".to_string()
}

fn emit_provisioning(app: &AppHandle, instance_id: &str, stage: &str, state: &str, message: &str) {
    let _ = app.emit(
        "instance-provisioning",
        serde_json::json!({
            "instance_id": instance_id,
            "stage": stage,
            "state": state,
            "message": message,
        }),
    );
}

fn aqua_root(mc_dir: Option<String>) -> Result<PathBuf, String> {
    mc_dir
        .map(PathBuf::from)
        .or_else(default_mc_dir)
        .ok_or_else(|| "Could not determine Aqua data directory.".to_string())
}

fn category_folder(category: &str) -> &'static str {
    match category {
        "resource-packs" | "resourcepacks" | "texturepacks" => "resourcepacks",
        "data-packs" | "datapacks" => "datapacks",
        "shaders" => "shaderpacks",
        _ => "mods",
    }
}

fn category_dir(root: &Path, profile_id: &str, category: &str) -> PathBuf {
    let content_root = read_metadata(root, profile_id)
        .and_then(|metadata| metadata.game_dir.map(PathBuf::from))
        .unwrap_or_else(|| instance_dir(root, profile_id));
    content_root.join(category_folder(category))
}

fn now_secs() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

fn validate_instance_name(input: &str) -> Result<String, String> {
    let name = input.trim().to_string();
    if name.is_empty() {
        Err("Instance name must contain at least one valid character.".to_string())
    } else {
        Ok(name)
    }
}

static INSTANCE_SEQUENCE: AtomicU64 = AtomicU64::new(0);
static INSTANCE_CREATION_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

pub(crate) fn new_instance_id(root: &Path) -> String {
    loop {
        let sequence = INSTANCE_SEQUENCE.fetch_add(1, Ordering::Relaxed);
        let id = format!("instance-{}-{}", now_secs(), sequence);
        if !instance_dir(root, &id).exists() && !metadata_path(root, &id).exists() {
            return id;
        }
    }
}

fn creation_lock() -> &'static Mutex<()> {
    INSTANCE_CREATION_LOCK.get_or_init(|| Mutex::new(()))
}

fn metadata_path(root: &Path, instance_id: &str) -> PathBuf {
    instance_dir(root, instance_id).join("instance.json")
}

#[tauri::command]
pub fn storage_integrity_check(mc_dir: Option<String>) -> Result<StorageIntegrityReport, String> {
    let root = aqua_root(mc_dir)?;
    let mut issues = Vec::new();
    let mut seen_ids = std::collections::HashSet::new();
    for profiles in [root.join("aqua_blobs").join("profiles"), root.join("profiles"), root.join("instances")] {
        let Ok(entries) = std::fs::read_dir(&profiles) else { continue };
        for entry in entries.flatten().filter(|entry| entry.path().is_dir()) {
            let directory_id = entry.file_name().to_string_lossy().to_string();
            let path = entry.path().join("instance.json");
            if !seen_ids.insert(directory_id.clone()) {
                issues.push(StorageIssue { kind: "duplicate_instance".into(), path: entry.path().display().to_string(), message: format!("Instance ID appears in multiple storage layouts: {directory_id}") });
                continue;
            }
            let Ok(raw) = std::fs::read_to_string(&path) else {
                issues.push(StorageIssue { kind: "missing_metadata".into(), path: path.display().to_string(), message: "instance.json is missing or unreadable".into() });
                continue;
            };
            let Ok(metadata) = serde_json::from_str::<InstanceMetadata>(&raw) else {
                issues.push(StorageIssue { kind: "corrupt_metadata".into(), path: path.display().to_string(), message: "instance.json is not valid Aqua metadata".into() });
                continue;
            };
            if metadata.id != directory_id { issues.push(StorageIssue { kind: "id_mismatch".into(), path: path.display().to_string(), message: format!("Metadata ID '{}' does not match directory '{directory_id}'", metadata.id) }); }
            if metadata.name.trim().is_empty() || metadata.mc_version.trim().is_empty() { issues.push(StorageIssue { kind: "incomplete_metadata".into(), path: path.display().to_string(), message: "Instance name and Minecraft version are required".into() }); }
            if !matches!(metadata.loader.as_str(), "vanilla" | "fabric" | "forge") { issues.push(StorageIssue { kind: "invalid_loader".into(), path: path.display().to_string(), message: format!("Unsupported loader '{}'", metadata.loader) }); }
            let version_json = root.join("versions").join(&metadata.installed_version_id).join(format!("{}.json", metadata.installed_version_id));
            if !version_json.exists() { issues.push(StorageIssue { kind: "missing_minecraft_metadata".into(), path: version_json.display().to_string(), message: "Installed version metadata is missing".into() }); }
            if let Some(game_dir) = metadata.game_dir.as_deref() {
                if !Path::new(game_dir).exists() { issues.push(StorageIssue { kind: "missing_game_directory".into(), path: game_dir.to_string(), message: "Configured game directory does not exist".into() }); }
            }
            if let Ok(version_raw) = std::fs::read_to_string(&version_json) {
                if let Ok(version) = serde_json::from_str::<serde_json::Value>(&version_raw) {
                    if let Some(libraries) = version["libraries"].as_array() {
                        for library in libraries {
                            if !crate::launch::library_allowed(library) { continue; }
                            let paths = library["downloads"]["artifact"]["path"].as_str().into_iter()
                                .chain(library["downloads"]["classifiers"].as_object().into_iter().flat_map(|classifiers| classifiers.values().filter_map(|item| item["path"].as_str())));
                            for relative in paths {
                                let full = root.join("libraries").join(relative);
                                if !full.exists() { issues.push(StorageIssue { kind: "missing_library".into(), path: full.display().to_string(), message: "Required library artifact is missing".into() }); }
                            }
                        }
                    }
                } else { issues.push(StorageIssue { kind: "corrupt_minecraft_metadata".into(), path: version_json.display().to_string(), message: "Minecraft version metadata is not valid JSON".into() }); }
            }
            let mods_dir = entry.path().join("mods");
            let lockfile = mods_dir.join(".aqua-modrinth.json");
            if let Ok(lock_raw) = std::fs::read_to_string(&lockfile) {
                if let Ok(items) = serde_json::from_str::<Vec<serde_json::Value>>(&lock_raw) {
                    let mut projects = std::collections::HashSet::new();
                    for item in items {
                        let project = item["project_id"].as_str().unwrap_or("");
                        let filename = item["filename"].as_str().unwrap_or("");
                        if !projects.insert(project.to_string()) { issues.push(StorageIssue { kind: "duplicate_mod_project".into(), path: lockfile.display().to_string(), message: format!("Project '{project}' appears more than once") }); }
                        if filename.is_empty() || !mods_dir.join(filename).exists() { issues.push(StorageIssue { kind: "orphan_lock_entry".into(), path: lockfile.display().to_string(), message: format!("Lock entry references missing file '{filename}'") }); }
                    }
                } else { issues.push(StorageIssue { kind: "corrupt_lockfile".into(), path: lockfile.display().to_string(), message: "Modrinth lockfile is not valid JSON".into() }); }
            }
        }
    }
    Ok(StorageIntegrityReport { healthy: issues.is_empty(), issues })
}

#[tauri::command]
pub fn validate_instance(mc_dir: Option<String>, instance_id: String) -> Result<StorageIntegrityReport, String> {
    let root = aqua_root(mc_dir)?;
    let dir = instance_dir(&root, &instance_id);
    let metadata_file = dir.join("instance.json");
    let mut issues = Vec::new();
    if !dir.exists() {
        issues.push(StorageIssue { kind: "missing_instance_directory".into(), path: dir.display().to_string(), message: "The instance directory is missing.".into() });
        return Ok(StorageIntegrityReport { healthy: false, issues });
    }
    let raw = std::fs::read_to_string(&metadata_file).map_err(|error| format!("Unable to read instance metadata: {error}"))?;
    let metadata = serde_json::from_str::<InstanceMetadata>(&raw).map_err(|error| format!("Instance metadata is corrupted: {error}"))?;
    if metadata.id != instance_id { issues.push(StorageIssue { kind: "id_mismatch".into(), path: metadata_file.display().to_string(), message: "Metadata ID does not match the instance directory.".into() }); }
    if metadata.name.trim().is_empty() || metadata.mc_version.trim().is_empty() { issues.push(StorageIssue { kind: "incomplete_metadata".into(), path: metadata_file.display().to_string(), message: "Instance name and Minecraft version are required.".into() }); }
    if !matches!(metadata.loader.as_str(), "vanilla" | "fabric" | "forge") { issues.push(StorageIssue { kind: "invalid_loader".into(), path: metadata_file.display().to_string(), message: format!("Unsupported loader '{}'.", metadata.loader) }); }
    for folder in ["mods", "resourcepacks", "shaderpacks", "datapacks"] {
        if !dir.join(folder).exists() { issues.push(StorageIssue { kind: "missing_instance_folder".into(), path: dir.join(folder).display().to_string(), message: format!("Required instance folder '{folder}' is missing.") }); }
    }
    let version_json = root.join("versions").join(&metadata.installed_version_id).join(format!("{}.json", metadata.installed_version_id));
    if !version_json.exists() { issues.push(StorageIssue { kind: "missing_minecraft_metadata".into(), path: version_json.display().to_string(), message: "Installed Minecraft version metadata is missing.".into() }); }
    Ok(StorageIntegrityReport { healthy: issues.is_empty(), issues })
}

#[tauri::command]
pub async fn repair_instance(
    app: AppHandle,
    mc_dir: Option<String>,
    instance_id: String,
) -> Result<InstanceInfo, String> {
    let root = aqua_root(mc_dir)?;
    let dir = instance_dir(&root, &instance_id);
    let metadata_file = dir.join("instance.json");
    if !dir.exists() { return Err(format!("Instance directory not found: {instance_id}")); }
    let raw = std::fs::read_to_string(&metadata_file).unwrap_or_default();
    let value = serde_json::from_str::<serde_json::Value>(&raw).unwrap_or_else(|_| serde_json::json!({}));
    let backup = dir.join(format!("instance.json.backup.{}", now_secs()));
    if metadata_file.exists() { std::fs::copy(&metadata_file, &backup).map_err(|error| format!("Unable to back up corrupted metadata: {error}"))?; }
    let text = |key: &str, fallback: String| value.get(key).and_then(|v| v.as_str()).map(str::trim).filter(|v| !v.is_empty()).map(String::from).unwrap_or(fallback);
    let now = now_secs();
    let loader = match text("loader", "vanilla".into()).as_str() {
        "fabric" | "forge" => text("loader", "vanilla".into()),
        _ => "vanilla".into(),
    };
    let metadata = InstanceMetadata {
        id: instance_id.clone(),
        name: text("name", format!("Minecraft {instance_id}")),
        mc_version: text("mc_version", text("version", "unknown".into())),
        loader,
        loader_version: value.get("loader_version").and_then(|v| v.as_str()).map(String::from),
        loader_mode: text("loader_mode", "automatic".into()),
        installed_version_id: text("installed_version_id", text("mc_version", instance_id.clone())),
        game_dir: value.get("game_dir").and_then(|v| v.as_str()).map(String::from),
        java_path: value.get("java_path").and_then(|v| v.as_str()).map(String::from),
        java_runtime: value.get("java_runtime").and_then(|v| v.as_str()).map(String::from),
        java_version: value.get("java_version").and_then(|v| v.as_str()).map(String::from),
        memory_mb: value.get("memory_mb").and_then(|v| v.as_u64()).map(|v| v as u32),
        java_args: value.get("java_args").and_then(|v| v.as_str()).map(String::from),
        install_state: Some("needs_repair".into()),
        created_at: value.get("created_at").and_then(|v| v.as_u64()).unwrap_or(now),
        updated_at: now,
        last_played_at: value.get("last_played_at").and_then(|v| v.as_u64()),
    };
    for folder in ["mods", "resourcepacks", "shaderpacks", "datapacks"] {
        std::fs::create_dir_all(dir.join(folder)).map_err(|error| {
            format!("Unable to restore instance folder '{folder}': {error}")
        })?;
    }
    if let Err(error) = write_metadata(&root, &metadata) {
        if backup.exists() { let _ = std::fs::copy(&backup, &metadata_file); }
        return Err(format!("Unable to repair instance metadata: {error}"));
    }

    let (installed_version_id, loader_version) = crate::install::install_version(
        app,
        metadata.loader.clone(),
        metadata.mc_version.clone(),
        metadata.loader_version.clone(),
        Some(root.to_string_lossy().to_string()),
    )
    .await
    .map_err(|error| format!("Instance metadata repaired, but installation could not be restored: {error}"))?;
    let repaired = InstanceMetadata {
        installed_version_id,
        loader_version,
        install_state: Some("installed".into()),
        updated_at: now_secs(),
        ..metadata
    };
    write_metadata(&root, &repaired)?;
    Ok(instance_info(&root, repaired))
}

pub(crate) fn read_metadata(root: &Path, instance_id: &str) -> Option<InstanceMetadata> {
    let path = metadata_path(root, instance_id);
    let data = std::fs::read_to_string(path).ok()?;
    serde_json::from_str::<InstanceMetadata>(&data).ok()
}

pub(crate) fn write_metadata(root: &Path, meta: &InstanceMetadata) -> Result<(), String> {
    let dir = instance_dir(root, &meta.id);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let data = serde_json::to_string_pretty(meta).map_err(|e| e.to_string())?;
    let path = dir.join("instance.json");
    atomic_write(&path, data.as_bytes())
}

fn instance_info(root: &Path, meta: InstanceMetadata) -> InstanceInfo {
    let mods_dir = category_dir(root, &meta.id, "mods");
    let packs_dir = category_dir(root, &meta.id, "texturepacks");
    let shaders_dir = category_dir(root, &meta.id, "shaders");
    InstanceInfo {
        id: meta.id,
        name: meta.name,
        mc_version: meta.mc_version,
        loader: meta.loader,
        loader_version: meta.loader_version,
        loader_mode: meta.loader_mode,
        installed_version_id: meta.installed_version_id,
        game_dir: meta.game_dir,
        java_path: meta.java_path,
        java_runtime: meta.java_runtime,
        java_version: meta.java_version,
        memory_mb: meta.memory_mb,
        java_args: meta.java_args,
        install_state: meta.install_state,
        created_at: meta.created_at,
        updated_at: meta.updated_at,
        last_played_at: meta.last_played_at,
        mod_count: count_files(&mods_dir),
        pack_count: count_files(&packs_dir),
        shader_count: count_files(&shaders_dir),
    }
}

fn has_valid_pack_meta(path: &Path) -> bool {
    path.file_name()
        .and_then(|f| f.to_str())
        .map(|n| {
            let n = n.to_lowercase();
            n.ends_with(".jar") || n.ends_with(".zip") || n.ends_with(".litemod") || n.ends_with(".disabled")
        })
        .unwrap_or(false)
}

fn content_filename(filename: &str) -> Result<&str, String> {
    let path = Path::new(filename);
    if filename.trim().is_empty()
        || path.file_name().and_then(|name| name.to_str()) != Some(filename)
        || path.is_absolute()
    {
        return Err(format!("Invalid content filename: {filename}"));
    }
    Ok(filename)
}

fn classify_archive(path: &Path) -> Option<&'static str> {
    let lower = path.file_name()?.to_string_lossy().to_lowercase();
    if lower.ends_with(".disabled") {
        return Some("mods");
    }
    if lower.ends_with(".jar") {
        if let Ok(file) = std::fs::File::open(path) {
            if let Ok(mut archive) = zip::ZipArchive::new(file) {
                for i in 0..archive.len() {
                    if let Ok(entry) = archive.by_index(i) {
                        let name = entry.name().to_lowercase();
                        if name == "fabric.mod.json" || name.ends_with("/fabric.mod.json") {
                            return Some("mods");
                        }
                        if name == "mods.toml" || name.ends_with("/mods.toml") {
                            return Some("mods");
                        }
                        if name == "pack.mcmeta" || name.ends_with("/pack.mcmeta") {
                            return Some("texturepacks");
                        }
                        if name.contains("shaders/") || name.ends_with(".fsh") || name.ends_with(".vsh") {
                            return Some("shaders");
                        }
                    }
                }
            }
        }
        return Some("mods");
    }
    if lower.ends_with(".zip") {
        if let Ok(file) = std::fs::File::open(path) {
            if let Ok(mut archive) = zip::ZipArchive::new(file) {
                for i in 0..archive.len() {
                    if let Ok(entry) = archive.by_index(i) {
                        let name = entry.name().to_lowercase();
                        if name == "pack.mcmeta" || name.ends_with("/pack.mcmeta") {
                            return Some("texturepacks");
                        }
                        if name.contains("shaders/") || name.ends_with(".fsh") || name.ends_with(".vsh") {
                            return Some("shaders");
                        }
                        if name == "fabric.mod.json" || name.ends_with("/fabric.mod.json") || name == "mods.toml" {
                            return Some("mods");
                        }
                    }
                }
            }
        }
        return Some("texturepacks");
    }
    None
}

fn open_path(p: &Path) -> std::io::Result<()> {
    if cfg!(target_os = "windows") {
        Command::new("explorer").arg(p).spawn()?;
    } else if cfg!(target_os = "macos") {
        Command::new("open").arg(p).spawn()?;
    } else {
        Command::new("xdg-open").arg(p).spawn()?;
    }
    Ok(())
}

#[tauri::command]
pub fn list_instances(mc_dir: Option<String>) -> Result<Vec<InstanceInfo>, String> {
    let root = aqua_root(mc_dir)?;
    let mut out = Vec::new();
    // Support the current KitStorage layout as well as older launcher roots.
    // `instance_dir` resolves the metadata location, so each entry remains one
    // canonical instance instead of becoming a second profile system.
    for profiles_dir in [
        root.join("aqua_blobs").join("profiles"),
        root.join("profiles"),
        root.join("instances"),
    ] {
        if let Ok(entries) = std::fs::read_dir(&profiles_dir) {
            for e in entries.flatten() {
                if !e.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                    continue;
                }
                let id = e.file_name().to_string_lossy().into_owned();
                if out.iter().any(|item: &InstanceInfo| item.id == id) {
                    continue;
                }
                if let Some(meta) = read_metadata(&root, &id) {
                    out.push(instance_info(&root, meta));
                }
            }
        }
    }

    out.sort_by(|a, b| b.updated_at.cmp(&a.updated_at).then_with(|| a.name.cmp(&b.name)));
    Ok(out)
}

fn count_files(dir: &Path) -> u64 {
    std::fs::read_dir(dir)
        .map(|it| {
            it.filter_map(|e| e.ok())
                .filter(|e| e.path().is_file())
                .count() as u64
        })
        .unwrap_or(0)
}

#[tauri::command]
pub fn list_mods(mc_dir: Option<String>, profile_id: String, category: String) -> Result<Vec<ModInfo>, String> {
    let root = aqua_root(mc_dir)?;
    let dir = category_dir(&root, &profile_id, &category);
    let _ = std::fs::create_dir_all(&dir);

    let mut out = Vec::new();
    let entries = std::fs::read_dir(&dir).map_err(|e| e.to_string())?;
    for e in entries.flatten() {
        let path = e.path();
        if !path.is_file() {
            continue;
        }

        let name = e.file_name().to_string_lossy().into_owned();
        let lower = name.to_lowercase();

        let (enabled, display_name) = if lower.ends_with(".disabled") {
            (false, name.strip_suffix(".disabled").unwrap_or(&name).to_string())
        } else if has_valid_pack_meta(&path) {
            (true, name)
        } else {
            continue;
        };

        let size = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
        out.push(ModInfo {
            filename: display_name,
            size,
            enabled,
            category: category.clone(),
        });
    }

    out.sort_by(|a, b| a.filename.to_lowercase().cmp(&b.filename.to_lowercase()));
    Ok(out)
}

#[tauri::command]
pub fn add_mod(
    mc_dir: Option<String>,
    profile_id: String,
    source_path: String,
    category: String,
) -> Result<String, String> {
    let root = aqua_root(mc_dir)?;
    let src = PathBuf::from(&source_path);
    if !src.exists() {
        return Err(format!("Source file does not exist: {}", src.display()));
    }

    let detected = classify_archive(&src).unwrap_or(category_folder(&category));
    let target_category = if category == "mods" && detected != "mods" {
        detected
    } else {
        category_folder(&category)
    };

    let target_dir = instance_dir(&root, &profile_id).join(target_category);
    std::fs::create_dir_all(&target_dir).map_err(|e| e.to_string())?;

    let filename = src.file_name().ok_or("Invalid content filename")?.to_string_lossy().into_owned();
    let dest = target_dir.join(&filename);
    std::fs::copy(&src, &dest).map_err(|e| e.to_string())?;

    Ok(target_category.to_string())
}

#[tauri::command]
pub fn delete_mod(
    mc_dir: Option<String>,
    profile_id: String,
    filename: String,
    category: String,
) -> Result<(), String> {
    let root = aqua_root(mc_dir)?;
    let filename = content_filename(&filename)?;
    let dir = category_dir(&root, &profile_id, &category);

    let candidates = [
        dir.join(&filename),
        dir.join(format!("{filename}.disabled")),
    ];

    let mut removed = false;
    for c in &candidates {
        if c.exists() {
            std::fs::remove_file(c).map_err(|e| e.to_string())?;
            removed = true;
        }
    }

    if !removed {
        return Err(format!("Content item was not found: {filename}"));
    }
    Ok(())
}

#[tauri::command]
pub fn toggle_mod(
    mc_dir: Option<String>,
    profile_id: String,
    filename: String,
    enabled: bool,
    category: String,
) -> Result<(), String> {
    let root = aqua_root(mc_dir)?;
    let filename = content_filename(&filename)?;
    let dir = category_dir(&root, &profile_id, &category);

    let active = dir.join(&filename);
    let disabled = dir.join(format!("{filename}.disabled"));

    if enabled {
        if active.exists() {
            return Ok(());
        }
        if disabled.exists() {
            std::fs::rename(&disabled, &active).map_err(|e| format!("Unable to enable content '{filename}': {e}"))?;
        } else {
            return Err(format!("Content item was not found: {filename}"));
        }
    } else if active.exists() {
        if disabled.exists() {
            return Err(format!("Cannot disable '{filename}': a disabled copy already exists"));
        }
        std::fs::rename(&active, &disabled).map_err(|e| format!("Unable to disable content '{filename}': {e}"))?;
    } else if disabled.exists() {
        return Ok(());
    } else {
        return Err(format!("Content item was not found: {filename}"));
    }

    Ok(())
}

#[tauri::command]
pub fn open_mods_folder(
    mc_dir: Option<String>,
    profile_id: String,
    category: String,
) -> Result<(), String> {
    let root = aqua_root(mc_dir)?;
    let dir = category_dir(&root, &profile_id, &category);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    open_path(&dir).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn rename_instance(
    mc_dir: Option<String>,
    old_instance_id: String,
    new_instance_id: String,
) -> Result<(), String> {
    let root = aqua_root(mc_dir)?;
    let layouts = [
        root.join("aqua_blobs").join("profiles"),
        root.join("profiles"),
        root.join("instances"),
    ];
    let (old_path, layout_root) = layouts
        .iter()
        .map(|layout| (layout.join(&old_instance_id), layout))
        .find(|(path, _)| path.is_dir())
        .ok_or_else(|| format!("Instance folder not found: {old_instance_id}"))?;
    let new_path = layout_root.join(&new_instance_id);

    if new_path.exists() {
        return Err(format!("Target instance folder already exists: {new_instance_id}"));
    }

    std::fs::rename(&old_path, &new_path).map_err(|e| e.to_string())?;
    let metadata_file = new_path.join("instance.json");
    if metadata_file.exists() {
        let raw = std::fs::read_to_string(&metadata_file).map_err(|e| e.to_string())?;
        let mut metadata: InstanceMetadata = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
        metadata.id = new_instance_id;
        metadata.updated_at = now_secs();
        atomic_write(&metadata_file, serde_json::to_string_pretty(&metadata).map_err(|e| e.to_string())?.as_bytes())?;
    }
    Ok(())
}

#[tauri::command]
pub fn save_instance_icon(
    mc_dir: Option<String>,
    instance_id: String,
    source_path: String,
) -> Result<String, String> {
    let root = aqua_root(mc_dir)?;
    let instance = instance_dir(&root, &instance_id);
    if !instance.exists() {
        return Err(format!("Instance folder not found: {instance_id}"));
    }
    let src = PathBuf::from(source_path);
    if !src.exists() {
        return Err(format!("Icon file does not exist: {}", src.display()));
    }
    if src.extension().and_then(|e| e.to_str()).map(|s| s.to_lowercase()) != Some("png".to_string()) {
        return Err("Only PNG icons are supported.".to_string());
    }
    let dest = instance.join("instance-icon.png");
    std::fs::copy(&src, &dest).map_err(|e| e.to_string())?;
    Ok(dest.to_string_lossy().to_string())
}

#[tauri::command]
pub fn read_instance_icon(
    mc_dir: Option<String>,
    instance_id: String,
) -> Result<Option<String>, String> {
    let root = aqua_root(mc_dir)?;
    let instance = instance_dir(&root, &instance_id);
    let icon_path = instance.join("instance-icon.png");
    if !icon_path.exists() {
        return Ok(None);
    }
    let bytes = std::fs::read(&icon_path).map_err(|e| e.to_string())?;
    let encoded = general_purpose::STANDARD.encode(bytes);
    Ok(Some(format!("data:image/png;base64,{encoded}")))
}

#[tauri::command]
#[allow(dead_code)]
pub async fn create_instance(
    app: AppHandle,
    instance_name: String,
    mc_version: String,
    loader: String,
    fabric_loader_version: Option<String>,
    mc_dir: Option<String>,
) -> Result<String, String> {
    let (root, instance_name, loader_mode, id, created_at) = {
        let _creation_guard = creation_lock()
            .lock()
            .map_err(|_| "Instance creation lock is unavailable.".to_string())?;
        let root = aqua_root(mc_dir.clone())?;
        let instance_name = validate_instance_name(&instance_name)?;
        for existing in list_instances(mc_dir.clone())? {
            if existing.name.eq_ignore_ascii_case(&instance_name)
                && existing.mc_version == mc_version
                && existing.loader == loader
            {
                return Ok(existing.id);
            }
        }
        let loader_mode = if fabric_loader_version.as_deref().unwrap_or_default().trim().is_empty() {
            "automatic".to_string()
        } else {
            "manual".to_string()
        };
        let id = new_instance_id(&root);
        let inst = instance_dir(&root, &id);
        if metadata_path(&root, &id).exists() {
            return Err(format!("Instance already exists: {id}"));
        }
        std::fs::create_dir_all(inst.join("mods")).map_err(|e| e.to_string())?;
        std::fs::create_dir_all(inst.join("resourcepacks")).map_err(|e| e.to_string())?;
        std::fs::create_dir_all(inst.join("shaderpacks")).map_err(|e| e.to_string())?;
        std::fs::create_dir_all(inst.join("datapacks")).map_err(|e| e.to_string())?;

        let created_at = now_secs();
        write_metadata(&root, &InstanceMetadata {
            id: id.clone(),
            name: instance_name.clone(),
            mc_version: mc_version.clone(),
            loader: loader.clone(),
            loader_version: None,
            loader_mode: loader_mode.clone(),
            installed_version_id: mc_version.clone(),
            game_dir: None,
            java_runtime: None,
            java_path: None,
            java_version: None,
            memory_mb: None,
            java_args: None,
            install_state: Some("provisioning".to_string()),
            created_at,
            updated_at: created_at,
            last_played_at: None,
        })?;
        emit_provisioning(&app, &id, "create_directory", "complete", "Instance directory created");
        emit_provisioning(&app, &id, "resolve_minecraft", "active", &format!("Resolving Minecraft {mc_version}"));
        (root, instance_name, loader_mode, id, created_at)
    };

    // Call the install_version command to install the requested Minecraft version/profile
    // and retrieve the final installed profile ID and resolved loader version.
    let (installed_version_id, resolved_loader_version) = match install_version_cmd(
        app.clone(),
        loader.clone(),
        mc_version.clone(),
        fabric_loader_version,
        mc_dir,
    ).await {
        Ok(result) => result,
        Err(error) => {
            if let Some(mut metadata) = read_metadata(&root, &id) {
                metadata.install_state = Some("failed".to_string());
                metadata.updated_at = now_secs();
                let _ = write_metadata(&root, &metadata);
            }
            emit_provisioning(&app, &id, "resolve_minecraft", "failed", &error);
            return Err(error);
        }
    };
    emit_provisioning(&app, &id, "resolve_minecraft", "complete", "Minecraft metadata and loader installed");
    emit_provisioning(&app, &id, "resolve_java", "active", "Resolving compatible Java");
    let java_path = match async {
        let version_dir = root.join("versions").join(&installed_version_id);
        let version_json = version_dir.join(format!("{installed_version_id}.json"));
        let metadata = std::fs::read_to_string(&version_json)
            .ok()
            .and_then(|raw| serde_json::from_str::<serde_json::Value>(&raw).ok());
        let metadata = metadata.map(|value| {
            if value.get("javaVersion").is_some() {
                return value;
            }
            value.get("inheritsFrom")
                .and_then(|item| item.as_str())
                .and_then(|id| std::fs::read_to_string(root.join("versions").join(id).join(format!("{id}.json"))).ok())
                .and_then(|raw| serde_json::from_str::<serde_json::Value>(&raw).ok())
                .unwrap_or(value)
        });
        let required_major = metadata
            .as_ref()
            .map(|value| crate::java::get_required_java_major_from_metadata(&mc_version, value))
            .unwrap_or_else(|| crate::java::get_required_java_major(&mc_version));
        crate::java::ensure_java_for_major(app.clone(), None, required_major).await
    }.await {
        Ok(path) => path,
        Err(error) => {
            if let Some(mut metadata) = read_metadata(&root, &id) {
                metadata.install_state = Some("failed".to_string());
                metadata.updated_at = now_secs();
                let _ = write_metadata(&root, &metadata);
            }
            emit_provisioning(&app, &id, "resolve_java", "failed", &error);
            return Err(error);
        }
    };
    emit_provisioning(&app, &id, "resolve_java", "complete", "Java runtime ready");
    emit_provisioning(&app, &id, "resolve_default_mods", "active", "Resolving Fabric baseline content");

    let mut metadata = InstanceMetadata {
        id: id.clone(),
        name: instance_name,
        mc_version: mc_version.clone(),
        loader: loader.clone(),
        loader_version: resolved_loader_version.clone(),
        loader_mode,
        installed_version_id,
        game_dir: None,
        java_runtime: Some(java_path.clone()),
        java_path: Some(java_path.clone()),
        java_version: crate::java::check_java_runtime(Path::new(&java_path), Some(&mc_version)).map(|runtime| runtime.version),
        memory_mb: None,
        java_args: None,
        install_state: Some("provisioning".to_string()),
        created_at,
        updated_at: now_secs(),
        last_played_at: None,
    };
    write_metadata(&root, &metadata)?;
    if loader == "fabric" {
        if let Some(loader_version) = resolved_loader_version.as_deref() {
            if let Err(error) = crate::mod_browser::install_default_fabric_mods(
                app.clone(),
                &mc_version,
                loader_version,
                &id,
                &root,
            ).await {
                append_launcher_log("warn", "fabric.baseline", &format!("Baseline content completed with unavailable components: {error}"));
            }
        }
    }
    emit_provisioning(&app, &id, "resolve_default_mods", "complete", "Baseline content resolved");
    emit_provisioning(&app, &id, "verify", "active", "Verifying instance files and metadata");
    let version_json = root.join("versions").join(&metadata.installed_version_id).join(format!("{}.json", metadata.installed_version_id));
    if !version_json.exists() || !Path::new(&java_path).exists() {
        metadata.install_state = Some("failed".to_string());
        metadata.updated_at = now_secs();
        write_metadata(&root, &metadata)?;
        let error = "Provisioning verification failed: required version metadata or Java runtime is missing".to_string();
        emit_provisioning(&app, &id, "verify", "failed", &error);
        return Err(error);
    }
    metadata.install_state = Some("ready".to_string());
    metadata.updated_at = now_secs();
    write_metadata(&root, &metadata)?;
    emit_provisioning(&app, &id, "verify", "complete", "Instance verified");
    emit_provisioning(&app, &id, "finalize", "complete", "Instance is ready");
    Ok(id)
}

#[tauri::command]
pub fn update_instance(
    mc_dir: Option<String>,
    instance_id: String,
    update: InstanceUpdate,
) -> Result<InstanceInfo, String> {
    let root = aqua_root(mc_dir)?;
    let mut meta = read_metadata(&root, &instance_id)
        .ok_or_else(|| format!("Instance metadata not found: {instance_id}"))?;
    if let Some(name) = update.name {
        let trimmed = name.trim();
        if trimmed.is_empty() {
            return Err("Instance name cannot be empty.".to_string());
        }
        meta.name = trimmed.to_string();
    }
    if let Some(version) = update.mc_version {
        if version.trim().is_empty() {
            return Err("Minecraft version cannot be empty.".to_string());
        }
        meta.mc_version = version;
    }
    if let Some(loader) = update.loader {
        if !matches!(loader.as_str(), "vanilla" | "fabric" | "forge") {
            return Err(format!("Unsupported loader: {loader}"));
        }
        if loader != meta.loader {
            let mods_dir = meta
                .game_dir
                .as_deref()
                .map(PathBuf::from)
                .unwrap_or_else(|| instance_dir(&root, &instance_id))
                .join("mods");
            let has_mods = fs::read_dir(&mods_dir)
                .map(|entries| entries.flatten().any(|entry| entry.path().is_file()))
                .unwrap_or(false);
            if has_mods {
                return Err("Loader change blocked: inspect or remove installed mods before changing the loader.".to_string());
            }
        }
        meta.loader = loader;
    }
    if update.loader_version.is_some() {
        meta.loader_version = update.loader_version;
    }
    if let Some(mode) = update.loader_mode {
        if !matches!(mode.as_str(), "automatic" | "manual") {
            return Err(format!("Unsupported loader mode: {mode}"));
        }
        meta.loader_mode = mode;
    }
    if update.game_dir.is_some() {
        meta.game_dir = update.game_dir;
    }
    if update.java_path.is_some() {
        meta.java_path = update.java_path;
    }
    if update.java_runtime.is_some() {
        meta.java_runtime = update.java_runtime;
    }
    if update.java_version.is_some() {
        meta.java_version = update.java_version;
    }
    if update.memory_mb.is_some() {
        meta.memory_mb = update.memory_mb;
    }
    if update.java_args.is_some() {
        meta.java_args = update.java_args;
    }
    if update.install_state.is_some() {
        meta.install_state = update.install_state;
    }
    meta.updated_at = now_secs();
    write_metadata(&root, &meta)?;
    Ok(instance_info(&root, meta))
}

fn copy_dir_all(src: &Path, dst: &Path) -> Result<(), String> {
    std::fs::create_dir_all(dst).map_err(|e| e.to_string())?;
    for entry in std::fs::read_dir(src).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let ty = entry.file_type().map_err(|e| e.to_string())?;
        let target = dst.join(entry.file_name());
        if ty.is_dir() {
            copy_dir_all(&entry.path(), &target)?;
        } else if ty.is_file() {
            std::fs::copy(entry.path(), target).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn duplicate_instance(
    mc_dir: Option<String>,
    instance_id: String,
    new_name: String,
) -> Result<String, String> {
    let root = aqua_root(mc_dir)?;
    let source_meta = read_metadata(&root, &instance_id)
        .ok_or_else(|| format!("Instance metadata not found: {instance_id}"))?;
    let new_name = validate_instance_name(&new_name)?;
    let new_id = new_instance_id(&root);
    let source = instance_dir(&root, &instance_id);
    let target = instance_dir(&root, &new_id);
    if target.exists() {
        return Err(format!("Instance already exists: {new_id}"));
    }
    copy_dir_all(&source, &target)?;
    let ts = now_secs();
    write_metadata(&root, &InstanceMetadata {
        id: new_id.clone(),
        name: new_name,
        mc_version: source_meta.mc_version,
        loader: source_meta.loader,
        loader_version: source_meta.loader_version,
        loader_mode: source_meta.loader_mode,
        installed_version_id: source_meta.installed_version_id,
        game_dir: source_meta.game_dir,
        java_path: source_meta.java_path,
        java_runtime: source_meta.java_runtime,
        java_version: source_meta.java_version,
        memory_mb: source_meta.memory_mb,
        java_args: source_meta.java_args,
        install_state: source_meta.install_state,
        created_at: ts,
        updated_at: ts,
        last_played_at: None,
    })?;
    Ok(new_id)
}

#[tauri::command]
pub fn delete_instance(mc_dir: Option<String>, instance_id: String) -> Result<(), String> {
    let root = aqua_root(mc_dir)?;
    let deleted_metadata = read_metadata(&root, &instance_id);
    let owned_game_dir = deleted_metadata.as_ref().and_then(|meta| meta.game_dir.clone()).map(PathBuf::from);
    let candidates = [
        root.join("aqua_blobs").join("profiles").join(&instance_id),
        root.join("profiles").join(&instance_id),
        root.join("instances").join(&instance_id),
    ];
    let mut removed = false;
    for dir in candidates {
        if dir.exists() {
            std::fs::remove_dir_all(dir).map_err(|e| e.to_string())?;
            removed = true;
        }
    }
    if let Some(game_dir) = owned_game_dir {
        if game_dir != root && game_dir.starts_with(&root) && game_dir.exists() {
            std::fs::remove_dir_all(game_dir).map_err(|e| e.to_string())?;
            removed = true;
        }
    }
    let version_dir = root.join("versions").join(&instance_id);
    if version_dir.exists() {
        std::fs::remove_dir_all(version_dir).map_err(|e| e.to_string())?;
        removed = true;
    }
    if !removed {
        // Deletion is idempotent: a folder removed externally is already gone.
        return Ok(());
    }
    if let Some(metadata) = deleted_metadata {
        let referenced_elsewhere = [
            root.join("aqua_blobs").join("profiles"),
            root.join("profiles"),
            root.join("instances"),
        ].iter().any(|directory| {
            std::fs::read_dir(directory).ok().into_iter().flatten().flatten().any(|entry| {
                read_metadata(&root, &entry.file_name().to_string_lossy()).map(|other| other.installed_version_id == metadata.installed_version_id).unwrap_or(false)
            })
        });
        if !referenced_elsewhere {
            let version_dir = root.join("versions").join(&metadata.installed_version_id);
            if version_dir.exists() {
                let _ = std::fs::remove_dir_all(version_dir);
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub fn open_instance_folder(mc_dir: Option<String>, instance_id: String) -> Result<(), String> {
    let root = aqua_root(mc_dir)?;
    let dir = instance_dir(&root, &instance_id);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    open_path(&dir).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn mark_instance_played(mc_dir: Option<String>, instance_id: String) -> Result<(), String> {
    let root = aqua_root(mc_dir)?;
    if let Some(mut meta) = read_metadata(&root, &instance_id) {
        let ts = now_secs();
        meta.last_played_at = Some(ts);
        meta.updated_at = ts;
        write_metadata(&root, &meta)?;
    }
    Ok(())
}

#[tauri::command]
pub fn get_instance(mc_dir: Option<String>, instance_id: String) -> Result<InstanceInfo, String> {
    let root = aqua_root(mc_dir)?;
    let meta = read_metadata(&root, &instance_id)
        .ok_or_else(|| format!("Instance not found: {}", instance_id))?;
    Ok(instance_info(&root, meta))
}
