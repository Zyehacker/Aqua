use std::{
    fs,
    path::{Path, PathBuf},
};

use reqwest::Url;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

use crate::settings::{default_mc_dir, instance_dir};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModSearchResult {
    pub id: String,
    pub slug: String,
    pub title: String,
    pub description: String,
    pub icon_url: Option<String>,
    pub downloads: u64,
    pub project_type: String,
    pub game_versions: Vec<String>,
    pub loaders: Vec<String>,
    pub page_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalItem {
    pub name: String,
    pub path: String,
    pub size: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstallState {
    pub installed: bool,
    pub json_exists: bool,
    pub jar_exists: bool,
    pub profile_exists: bool,
}

fn project_type_for(category: &str) -> &'static str {
    match category {
        "resourcepacks" | "texturepacks" => "resourcepack",
        "shaders" => "shader",
        _ => "mod",
    }
}

fn folder_for(category: &str) -> &'static str {
    match category {
        "resourcepacks" | "texturepacks" => "resourcepacks",
        "shaders" => "shaderpacks",
        _ => "mods",
    }
}

fn target_mc_dir(mc_dir: Option<String>) -> Result<PathBuf, String> {
    mc_dir
        .map(PathBuf::from)
        .or_else(default_mc_dir)
        .ok_or_else(|| "Could not determine .minecraft directory".to_string())
}

fn read_dir_items(dir: &Path) -> Vec<LocalItem> {
    let mut out = Vec::new();

    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                if let Ok(meta) = entry.metadata() {
                    out.push(LocalItem {
                        name: entry.file_name().to_string_lossy().to_string(),
                        path: path.to_string_lossy().to_string(),
                        size: meta.len(),
                    });
                }
            }
        }
    }

    out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    out
}

#[tauri::command]
pub fn is_version_installed(
    mc_version: String,
    mc_dir: Option<String>,
) -> Result<InstallState, String> {
    let mc_dir = target_mc_dir(mc_dir)?;
    let version_dir = mc_dir.join("versions").join(&mc_version);

    let json_exists = version_dir.join(format!("{mc_version}.json")).exists();
    let jar_exists = version_dir.join(format!("{mc_version}.jar")).exists();

    let profile_exists = version_dir.exists()
        && fs::read_dir(&version_dir)
            .ok()
            .map(|mut it| it.any(|e| {
                e.ok()
                    .and_then(|f| f.path().extension().map(|x| x == "json"))
                    .unwrap_or(false)
            }))
            .unwrap_or(false);

    Ok(InstallState {
        installed: json_exists && jar_exists,
        json_exists,
        jar_exists,
        profile_exists,
    })
}

#[tauri::command]
pub async fn search_modrinth(
    query: String,
    category: String,
    mc_version: String,
    loader: String,
    limit: Option<u32>,
) -> Result<Vec<ModSearchResult>, String> {
    let client = reqwest::Client::builder()
        .user_agent("AquaClient/1.0")
        .build()
        .map_err(|e| e.to_string())?;

    let mut url = Url::parse("https://api.modrinth.com/v2/search").map_err(|e| e.to_string())?;
    {
        let mut qp = url.query_pairs_mut();
        qp.append_pair("query", &query);
        qp.append_pair("limit", &limit.unwrap_or(24).to_string());
        qp.append_pair("index", "relevance");
    }

    let resp: serde_json::Value = client
        .get(url)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;

    let wanted_type = project_type_for(&category).to_string();
    let hits = resp["hits"].as_array().cloned().unwrap_or_default();
    let mut out = Vec::new();

    for hit in hits {
        let project_type = hit["project_type"].as_str().unwrap_or("").to_string();
        if project_type != wanted_type {
            continue;
        }

        let game_versions: Vec<String> = hit["versions"]
            .as_array()
            .map(|arr| {
                arr.iter()
                    .filter_map(|v| v.as_str().map(|s| s.to_string()))
                    .collect()
            })
            .unwrap_or_default();

        if !mc_version.trim().is_empty() && !game_versions.iter().any(|v| v == &mc_version) {
            continue;
        }

        let loaders: Vec<String> = hit["loaders"]
            .as_array()
            .map(|arr| {
                arr.iter()
                    .filter_map(|v| v.as_str().map(|s| s.to_string()))
                    .collect()
            })
            .unwrap_or_default();

        if loader != "vanilla" && !loader.trim().is_empty() && !loaders.iter().any(|l| l == &loader) {
            continue;
        }

        let id = hit["project_id"]
            .as_str()
            .or_else(|| hit["id"].as_str())
            .unwrap_or("")
            .to_string();

        let slug = hit["slug"].as_str().unwrap_or("").to_string();
        let title = hit["title"].as_str().unwrap_or("Untitled").to_string();
        let description = hit["description"].as_str().unwrap_or("").to_string();
        let icon_url = hit["icon_url"].as_str().map(|s| s.to_string());
        let downloads = hit["downloads"].as_u64().unwrap_or(0);
        let page_url = if slug.is_empty() {
            "https://modrinth.com".to_string()
        } else {
            format!("https://modrinth.com/{}/{}", project_type, slug)
        };

        out.push(ModSearchResult {
            id,
            slug,
            title,
            description,
            icon_url,
            downloads,
            project_type,
            game_versions,
            loaders,
            page_url,
        });
    }

    Ok(out)
}

#[tauri::command]
pub fn list_instance_items(
    mc_version: String,
    category: String,
    mc_dir: Option<String>,
) -> Result<Vec<LocalItem>, String> {
    let mc_dir = target_mc_dir(mc_dir)?;
    let instance = instance_dir(&mc_dir, &mc_version);
    let folder = instance.join(folder_for(&category));
    fs::create_dir_all(&folder).map_err(|e| e.to_string())?;
    Ok(read_dir_items(&folder))
}

#[tauri::command]
pub fn remove_instance_item(path: String) -> Result<(), String> {
    let p = PathBuf::from(path);
    if p.exists() {
        fs::remove_file(&p).map_err(|e| e.to_string())?;
    }
    Ok(())
}

async fn download_to(client: &reqwest::Client, url: &str, dest: &Path) -> Result<(), String> {
    if dest.exists() {
        return Ok(());
    }

    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let bytes = client
        .get(url)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .bytes()
        .await
        .map_err(|e| e.to_string())?;

    fs::write(dest, &bytes).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn install_modrinth_project(
    app: AppHandle,
    project_id: String,
    category: String,
    mc_version: String,
    loader: String,
    mc_dir: Option<String>,
) -> Result<String, String> {
    let mc_dir = target_mc_dir(mc_dir)?;
    let instance = instance_dir(&mc_dir, &mc_version);
    let folder = instance.join(folder_for(&category));
    fs::create_dir_all(&folder).map_err(|e| e.to_string())?;

    let client = reqwest::Client::builder()
        .user_agent("AquaClient/1.0")
        .build()
        .map_err(|e| e.to_string())?;

    let versions_url = format!("https://api.modrinth.com/v2/project/{project_id}/version");
    let versions: serde_json::Value = client
        .get(&versions_url)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;

    let arr = versions.as_array().cloned().unwrap_or_default();
    let mut chosen: Option<serde_json::Value> = None;

    for v in &arr {
        let game_ok = v["game_versions"]
            .as_array()
            .map(|a| a.iter().any(|x| x.as_str() == Some(mc_version.as_str())))
            .unwrap_or(false);

        let loader_ok = if loader == "vanilla" || loader.trim().is_empty() {
            true
        } else {
            v["loaders"]
                .as_array()
                .map(|a| a.iter().any(|x| x.as_str() == Some(loader.as_str())))
                .unwrap_or(false)
        };

        let file_ok = v["files"]
            .as_array()
            .and_then(|a| a.first())
            .and_then(|f| f["url"].as_str())
            .is_some();

        if game_ok && loader_ok && file_ok {
            chosen = Some(v.clone());
            break;
        }
    }

    if chosen.is_none() {
        for v in &arr {
            let file_ok = v["files"]
                .as_array()
                .and_then(|a| a.first())
                .and_then(|f| f["url"].as_str())
                .is_some();
            if file_ok {
                chosen = Some(v.clone());
                break;
            }
        }
    }

    let chosen = chosen.ok_or_else(|| "No compatible Modrinth version found".to_string())?;
    let file = chosen["files"]
        .as_array()
        .and_then(|a| a.first())
        .ok_or_else(|| "Version has no downloadable file".to_string())?;

    let file_url = file["url"]
        .as_str()
        .ok_or_else(|| "File URL missing".to_string())?;

    let filename = file["filename"]
        .as_str()
        .unwrap_or("downloaded_mod.jar");

    let dest = folder.join(filename);

    let _ = app.emit(
        "install-status",
        serde_json::json!({
            "phase": "progress",
            "message": format!("Downloading {filename}..."),
            "done": 0,
            "total": 1
        }),
    );

    download_to(&client, file_url, &dest).await?;

    let _ = app.emit(
        "install-status",
        serde_json::json!({
            "phase": "done",
            "message": format!("Installed {filename}"),
            "done": 1,
            "total": 1
        }),
    );

    Ok(dest.to_string_lossy().to_string())
}
