use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

use base64::{engine::general_purpose, Engine};
use serde::{Deserialize, Serialize};

use crate::settings::{default_mc_dir, instance_dir};
use tauri::AppHandle;
use crate::install::install_version as install_version_cmd;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ModInfo {
    pub filename: String,
    pub size: u64,
    pub enabled: bool,
    pub category: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct InstanceInfo {
    pub id: String,
    pub name: String,
    pub mc_version: String,
    pub loader: String,
    pub loader_version: Option<String>,
    pub installed_version_id: String,
    pub created_at: u64,
    pub updated_at: u64,
    pub last_played_at: Option<u64>,
    pub mod_count: u64,
    pub pack_count: u64,
    pub shader_count: u64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
struct InstanceMetadata {
    pub id: String,
    pub name: String,
    pub mc_version: String,
    pub loader: String,
    pub loader_version: Option<String>,
    pub installed_version_id: String,
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
}

fn aqua_root(mc_dir: Option<String>) -> Result<PathBuf, String> {
    mc_dir
        .map(PathBuf::from)
        .or_else(default_mc_dir)
        .ok_or_else(|| "Could not determine Aqua data directory.".to_string())
}

fn category_folder(category: &str) -> &'static str {
    match category {
        "texturepacks" => "resourcepacks",
        "shaders" => "shaderpacks",
        _ => "mods",
    }
}

fn category_dir(root: &Path, profile_id: &str, category: &str) -> PathBuf {
    instance_dir(root, profile_id).join(category_folder(category))
}

fn now_secs() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

fn safe_id(input: &str) -> Result<String, String> {
    let id = input
        .trim()
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.') {
                c
            } else if c.is_whitespace() {
                '-'
            } else {
                '_'
            }
        })
        .collect::<String>()
        .trim_matches(['-', '_', '.'])
        .to_string();
    if id.is_empty() {
        Err("Instance name must contain at least one valid character.".to_string())
    } else {
        Ok(id)
    }
}

fn metadata_path(root: &Path, instance_id: &str) -> PathBuf {
    instance_dir(root, instance_id).join("instance.json")
}

fn read_metadata(root: &Path, instance_id: &str) -> Option<InstanceMetadata> {
    let path = metadata_path(root, instance_id);
    let data = std::fs::read_to_string(path).ok()?;
    serde_json::from_str::<InstanceMetadata>(&data).ok()
}

fn write_metadata(root: &Path, meta: &InstanceMetadata) -> Result<(), String> {
    let dir = instance_dir(root, &meta.id);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let data = serde_json::to_string_pretty(meta).map_err(|e| e.to_string())?;
    std::fs::write(dir.join("instance.json"), data).map_err(|e| e.to_string())
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
        installed_version_id: meta.installed_version_id,
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
    let profiles_dir = root.join("aqua_blobs").join("profiles");

    let mut out = Vec::new();
    if let Ok(entries) = std::fs::read_dir(&profiles_dir) {
        for e in entries.flatten() {
            if !e.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                continue;
            }
            let id = e.file_name().to_string_lossy().into_owned();
            if let Some(meta) = read_metadata(&root, &id) {
                out.push(instance_info(&root, meta));
            }
        }
    }

    let versions_dir = root.join("versions");
    if let Ok(entries) = std::fs::read_dir(&versions_dir) {
        for e in entries.flatten() {
            if !e.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                continue;
            }
            let id = e.file_name().to_string_lossy().into_owned();
            let json = e.path().join(format!("{}.json", &id));
            if !json.exists() {
                continue;
            }
            if out.iter().any(|item| item.installed_version_id == id || item.id == id) {
                continue;
            }

            let loader = if id.contains("forge") {
                "forge"
            } else if id.starts_with("fabric-loader-") {
                "fabric"
            } else {
                "vanilla"
            };
            let meta = InstanceMetadata {
                id: id.clone(),
                name: id.clone(),
                mc_version: id.clone(),
                loader: loader.to_string(),
                loader_version: None,
                installed_version_id: id,
                created_at: 0,
                updated_at: 0,
                last_played_at: None,
            };
            out.push(instance_info(&root, meta));
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

    let filename = src.file_name().ok_or("invalid filename")?.to_string_lossy().into_owned();
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
        return Err(format!("Item not found: {filename}"));
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
    let dir = category_dir(&root, &profile_id, &category);

    let active = dir.join(&filename);
    let disabled = dir.join(format!("{filename}.disabled"));

    if enabled {
        if disabled.exists() {
            std::fs::rename(&disabled, &active).map_err(|e| e.to_string())?;
        }
    } else if active.exists() {
        std::fs::rename(&active, &disabled).map_err(|e| e.to_string())?;
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
    let profiles = root.join("profiles");
    let legacy = root.join("instances");
    let old_path = if profiles.join(&old_instance_id).exists() {
        profiles.join(&old_instance_id)
    } else if legacy.join(&old_instance_id).exists() {
        legacy.join(&old_instance_id)
    } else {
        return Err(format!("Instance folder not found: {old_instance_id}"));
    };

    let new_path = if old_path.starts_with(&profiles) {
        profiles.join(&new_instance_id)
    } else {
        legacy.join(&new_instance_id)
    };

    if new_path.exists() {
        return Err(format!("Target instance folder already exists: {new_instance_id}"));
    }

    std::fs::rename(&old_path, &new_path).map_err(|e| e.to_string())?;
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
    let root = aqua_root(mc_dir.clone())?;
    let id = safe_id(&instance_name)?;
    let inst = instance_dir(&root, &id);
    if metadata_path(&root, &id).exists() {
        return Err(format!("Instance already exists: {id}"));
    }
    // Create standard instance folders
    std::fs::create_dir_all(inst.join("mods")).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(inst.join("resourcepacks")).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(inst.join("shaderpacks")).map_err(|e| e.to_string())?;

    // Call the install_version command to install the requested Minecraft version/profile
    let loader_version = fabric_loader_version.clone();
    let installed_version_id = install_version_cmd(app, loader.clone(), mc_version.clone(), fabric_loader_version, mc_dir).await?;
    let ts = now_secs();
    write_metadata(&root, &InstanceMetadata {
        id: id.clone(),
        name: instance_name.trim().to_string(),
        mc_version,
        loader,
        loader_version,
        installed_version_id,
        created_at: ts,
        updated_at: ts,
        last_played_at: None,
    })?;
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
        meta.loader = loader;
    }
    if update.loader_version.is_some() {
        meta.loader_version = update.loader_version;
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
    let new_id = safe_id(&new_name)?;
    let source = instance_dir(&root, &instance_id);
    let target = instance_dir(&root, &new_id);
    if target.exists() {
        return Err(format!("Instance already exists: {new_id}"));
    }
    copy_dir_all(&source, &target)?;
    let ts = now_secs();
    write_metadata(&root, &InstanceMetadata {
        id: new_id.clone(),
        name: new_name.trim().to_string(),
        mc_version: source_meta.mc_version,
        loader: source_meta.loader,
        loader_version: source_meta.loader_version,
        installed_version_id: source_meta.installed_version_id,
        created_at: ts,
        updated_at: ts,
        last_played_at: None,
    })?;
    Ok(new_id)
}

#[tauri::command]
pub fn delete_instance(mc_dir: Option<String>, instance_id: String) -> Result<(), String> {
    let root = aqua_root(mc_dir)?;
    let dir = instance_dir(&root, &instance_id);
    if !dir.exists() {
        return Err(format!("Instance folder not found: {instance_id}"));
    }
    std::fs::remove_dir_all(dir).map_err(|e| e.to_string())
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
