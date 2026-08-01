use std::path::{Path, PathBuf};
use std::process::Command;

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
    pub mod_count: u64,
    pub pack_count: u64,
    pub shader_count: u64,
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
    let versions_dir = root.join("versions");

    let mut out = Vec::new();
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

            let mods_dir = category_dir(&root, &id, "mods");
            let packs_dir = category_dir(&root, &id, "texturepacks");
            let shaders_dir = category_dir(&root, &id, "shaders");

            let mod_count = count_files(&mods_dir);
            let pack_count = count_files(&packs_dir);
            let shader_count = count_files(&shaders_dir);

            out.push(InstanceInfo {
                id,
                mod_count,
                pack_count,
                shader_count,
            });
        }
    }

    out.sort_by(|a, b| a.id.cmp(&b.id));
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
    let inst = instance_dir(&root, &instance_name);
    // Create standard instance folders
    std::fs::create_dir_all(inst.join("mods")).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(inst.join("resourcepacks")).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(inst.join("shaderpacks")).map_err(|e| e.to_string())?;

    // Call the install_version command to install the requested Minecraft version/profile
    let res = install_version_cmd(app, loader, mc_version, fabric_loader_version, mc_dir).await;
    match res {
        Ok(id) => Ok(id),
        Err(e) => Err(e),
    }
}
