use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use tokio::sync::Semaphore;
use tokio::time::{sleep, Duration};

const DOWNLOAD_RETRIES: usize = 3;
const RETRY_DELAY_MS: u64 = 700;

use crate::java::{ensure_java, ensure_java_for_major, get_required_java_major_from_metadata};
use crate::launch::library_allowed;
use crate::settings::{append_launcher_log, default_mc_dir};

const VERSION_MANIFEST_URL: &str =
    "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";
const RESOURCES_BASE: &str = "https://resources.download.minecraft.net";
const FABRIC_META_BASE: &str = "https://meta.fabricmc.net/v2";
const FORGE_MAVEN_BASE: &str = "https://maven.minecraftforge.net/net/minecraftforge/forge";
const FORGE_PROMOTIONS_URL: &str =
    "https://maven.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json";
const DOWNLOAD_CONCURRENCY: usize = 12;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct RemoteVersion {
    pub id: String,
    pub r#type: String,
    pub url: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct FabricLoader {
    pub version: String,
    pub stable: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ForgeLoader {
    pub version: String,
    pub recommended: bool,
}

pub fn emit_status(app: &AppHandle, phase: &str, message: &str, done: u64, total: u64) {
    let _ = app.emit(
        "install-status",
        serde_json::json!({
            "phase": phase,
            "message": message,
            "done": done,
            "total": total,
        }),
    );
}

fn aqua_dir_from(mc_dir: Option<String>) -> Result<PathBuf, String> {
    mc_dir
        .map(PathBuf::from)
        .or_else(default_mc_dir)
        .ok_or_else(|| "Could not determine .minecraft directory".to_string())
}

async fn http_json(client: &reqwest::Client, url: &str) -> Result<serde_json::Value, String> {
    let mut last_err = None;
    for attempt in 1..=DOWNLOAD_RETRIES {
        match client.get(url).send().await {
            Ok(resp) => {
                if !resp.status().is_success() {
                    return Err(format!("HTTP {} for {url}", resp.status()));
                }
                return resp.json().await.map_err(|e| e.to_string());
            }
            Err(e) => {
                last_err = Some(e.to_string());
                if attempt < DOWNLOAD_RETRIES {
                    sleep(Duration::from_millis(RETRY_DELAY_MS)).await;
                }
            }
        }
    }
    Err(last_err.unwrap_or_else(|| format!("Failed to fetch {url}")))
}

async fn http_text(client: &reqwest::Client, url: &str) -> Result<String, String> {
    let mut last_err = None;
    for attempt in 1..=DOWNLOAD_RETRIES {
        match client.get(url).send().await {
            Ok(resp) => {
                if !resp.status().is_success() {
                    return Err(format!("HTTP {} for {url}", resp.status()));
                }
                return resp.text().await.map_err(|e| e.to_string());
            }
            Err(e) => {
                last_err = Some(e.to_string());
                if attempt < DOWNLOAD_RETRIES {
                    sleep(Duration::from_millis(RETRY_DELAY_MS)).await;
                }
            }
        }
    }
    Err(last_err.unwrap_or_else(|| format!("Failed to fetch {url}")))
}

async fn download_file(
    client: &reqwest::Client,
    url: &str,
    dest: &Path,
    expected_sha1: Option<&str>,
) -> Result<(), String> {
    if dest.exists() {
        if let Some(expected) = expected_sha1 {
            if let Ok(bytes) = std::fs::read(dest) {
                use sha1::{Digest, Sha1};
                let mut hasher = Sha1::new();
                hasher.update(&bytes);
                let hash = format!("{:x}", hasher.finalize());
                if hash == expected {
                    return Ok(());
                }
            }
        } else {
            return Ok(());
        }
    }

    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let temp = dest.with_extension("part");
    let mut last_err = None;
    for attempt in 1..=DOWNLOAD_RETRIES {
        match client.get(url).send().await {
            Ok(resp) => {
                if !resp.status().is_success() {
                    last_err = Some(format!("HTTP {} for {url}", resp.status()));
                } else if let Ok(bytes) = resp.bytes().await {
                    if let Some(expected) = expected_sha1 {
                        use sha1::{Digest, Sha1};
                        let mut hasher = Sha1::new();
                        hasher.update(&bytes);
                        let hash = format!("{:x}", hasher.finalize());
                        if hash != expected {
                            last_err = Some(format!("SHA1 mismatch for {url}"));
                            continue;
                        }
                    }
                    std::fs::write(&temp, &bytes).map_err(|e| e.to_string())?;
                    std::fs::rename(&temp, dest).map_err(|e| e.to_string())?;
                    return Ok(());
                } else {
                    last_err = Some(format!("Failed to download bytes from {url}"));
                }
            }
            Err(e) => last_err = Some(e.to_string()),
        }
        if attempt < DOWNLOAD_RETRIES {
            sleep(Duration::from_millis(RETRY_DELAY_MS)).await;
        }
    }
    let _ = std::fs::remove_file(&temp);
    Err(last_err.unwrap_or_else(|| format!("Failed to download {url} to {}", dest.display())))
}

fn maven_path_from_coord(coord: &str) -> Option<String> {
    let (coord, ext) = match coord.split_once('@') {
        Some((c, e)) => (c, e.to_string()),
        None => (coord, "jar".to_string()),
    };
    let parts: Vec<&str> = coord.split(':').collect();
    if parts.len() < 3 {
        return None;
    }

    let group = parts[0].replace('.', "/");
    let artifact = parts[1];
    let version = parts[2];
    let classifier = parts.get(3).copied();
    let filename = match classifier {
        Some(c) => format!("{artifact}-{version}-{c}.{ext}"),
        None => format!("{artifact}-{version}.{ext}"),
    };

    Some(format!("{group}/{artifact}/{version}/{filename}"))
}

fn library_artifact(lib: &serde_json::Value) -> Option<(String, String)> {
    if let (Some(url), Some(path)) = (
        lib.get("downloads")
            .and_then(|d| d.get("artifact"))
            .and_then(|a| a.get("url"))
            .and_then(|u| u.as_str()),
        lib.get("downloads")
            .and_then(|d| d.get("artifact"))
            .and_then(|a| a.get("path"))
            .and_then(|p| p.as_str()),
    ) {
        if !url.trim().is_empty() && !path.trim().is_empty() {
            return Some((url.to_string(), path.to_string()));
        }
    }

    let name = lib.get("name").and_then(|n| n.as_str())?;
    let base_url = lib
        .get("url")
        .and_then(|u| u.as_str())
        .filter(|u| !u.trim().is_empty())
        .unwrap_or("https://repo1.maven.org/maven2/");
    let path = maven_path_from_coord(name)?;
    let url = format!("{}/{}", base_url.trim_end_matches('/'), path);
    Some((url, path))
}

fn library_artifacts(lib: &serde_json::Value) -> Vec<(String, String, Option<String>)> {
    let mut artifacts = Vec::new();
    if let Some((url, path)) = library_artifact(lib) {
        let sha1 = lib["downloads"]["artifact"]["sha1"]
            .as_str()
            .map(String::from);
        artifacts.push((url, path, sha1));
    }

    if let Some(classifiers) = lib["downloads"]["classifiers"].as_object() {
        for artifact in classifiers.values() {
            let Some(url) = artifact.get("url").and_then(|v| v.as_str()) else {
                continue;
            };
            let Some(path) = artifact.get("path").and_then(|v| v.as_str()) else {
                continue;
            };
            artifacts.push((
                url.to_string(),
                path.to_string(),
                artifact
                    .get("sha1")
                    .and_then(|v| v.as_str())
                    .map(String::from),
            ));
        }
    }

    // Some recent Minecraft metadata lists the LWJGL unsafe classifier as
    // the only core artifact, although Minecraft still loads classes from
    // the unclassified core jar.
    if let Some((url, path, _)) = artifacts
        .iter()
        .find(|(_, path, _)| path.ends_with("/lwjgl-3.4.1-unsafe.jar"))
        .cloned()
    {
        let core_path = path.replace("-unsafe.jar", ".jar");
        artifacts.push((url.replace("-unsafe.jar", ".jar"), core_path, None));
    }

    artifacts
}

fn jar_contains_class(jar_path: &Path, class_path: &str) -> Result<bool, String> {
    let file = std::fs::File::open(jar_path)
        .map_err(|e| format!("Could not open {}: {e}", jar_path.display()))?;
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|e| format!("Could not read {} as a JAR: {e}", jar_path.display()))?;
    let result = archive.by_name(class_path).is_ok();
    Ok(result)
}

#[tauri::command]
pub async fn list_remote_versions(
    include_snapshots: Option<bool>,
) -> Result<Vec<RemoteVersion>, String> {
    let client = reqwest::Client::new();
    let manifest = http_json(&client, VERSION_MANIFEST_URL).await?;
    let snaps = include_snapshots.unwrap_or(false);
    let mut out = Vec::new();

    if let Some(arr) = manifest["versions"].as_array() {
        for v in arr {
            let t = v["type"].as_str().unwrap_or("").to_string();
            if !snaps && t != "release" {
                continue;
            }
            if let (Some(id), Some(url)) = (v["id"].as_str(), v["url"].as_str()) {
                out.push(RemoteVersion {
                    id: id.into(),
                    r#type: t,
                    url: url.into(),
                });
            }
        }
    }

    Ok(out)
}

#[tauri::command]
pub async fn list_fabric_loaders(mc_version: String) -> Result<Vec<FabricLoader>, String> {
    let client = reqwest::Client::new();
    let url = format!("{FABRIC_META_BASE}/versions/loader/{mc_version}");
    let arr = http_json(&client, &url).await?;
    let mut out = Vec::new();

    if let Some(list) = arr.as_array() {
        for entry in list {
            if let Some(loader) = entry.get("loader") {
                if let Some(version) = loader["version"].as_str() {
                    out.push(FabricLoader {
                        version: version.into(),
                        stable: loader["stable"].as_bool().unwrap_or(false),
                    });
                }
            }
        }
    }

    Ok(out)
}

fn extract_xml_versions(xml: &str, mc_version: &str) -> Vec<String> {
    let prefix = format!("{mc_version}-");
    let mut out = Vec::new();
    for part in xml.split("<version>").skip(1) {
        let Some((raw, _)) = part.split_once("</version>") else {
            continue;
        };
        let Some(version) = raw.strip_prefix(&prefix) else {
            continue;
        };
        if !version.contains("pre") && !version.contains("beta") {
            out.push(version.to_string());
        }
    }
    out.sort();
    out.dedup();
    out.reverse();
    out
}

async fn resolve_forge_loader(
    client: &reqwest::Client,
    mc_version: &str,
    requested: Option<String>,
) -> Result<String, String> {
    if let Some(version) = requested {
        let trimmed = version.trim();
        if !trimmed.is_empty() {
            return Ok(trimmed.to_string());
        }
    }

    if let Ok(promotions) = http_json(client, FORGE_PROMOTIONS_URL).await {
        let promos = promotions.get("promos").and_then(|v| v.as_object());
        if let Some(promos) = promos {
            for suffix in ["recommended", "latest"] {
                let key = format!("{mc_version}-{suffix}");
                if let Some(version) = promos.get(&key).and_then(|v| v.as_str()) {
                    return Ok(version.to_string());
                }
            }
        }
    }

    let metadata = http_text(client, &format!("{FORGE_MAVEN_BASE}/maven-metadata.xml")).await?;
    extract_xml_versions(&metadata, mc_version)
        .into_iter()
        .next()
        .ok_or_else(|| format!("No Forge loader versions found for Minecraft {mc_version}"))
}

async fn ensure_java_for_profile(
    app: &AppHandle,
    mc_dir: &Path,
    profile_id: &str,
    mc_version: &str,
) -> Result<String, String> {
    let profile_path = mc_dir
        .join("versions")
        .join(profile_id)
        .join(format!("{profile_id}.json"));
    let profile = std::fs::read_to_string(&profile_path)
        .ok()
        .and_then(|raw| serde_json::from_str::<serde_json::Value>(&raw).ok());
    let metadata = profile.map(|value| {
        if value.get("javaVersion").is_some() {
            return value;
        }
        value
            .get("inheritsFrom")
            .and_then(|parent| parent.as_str())
            .and_then(|parent_id| {
                let path = mc_dir
                    .join("versions")
                    .join(parent_id)
                    .join(format!("{parent_id}.json"));
                std::fs::read_to_string(path).ok()
            })
            .and_then(|raw| serde_json::from_str::<serde_json::Value>(&raw).ok())
            .unwrap_or(value)
    });
    let required_major = metadata
        .as_ref()
        .map(|value| get_required_java_major_from_metadata(mc_version, value))
        .unwrap_or_else(|| crate::java::get_required_java_major(mc_version));
    let java = ensure_java_for_major(app.clone(), None, required_major).await?;
    append_launcher_log(
        "info",
        "java",
        &format!("Java {required_major} ready for Minecraft {mc_version}: {java}"),
    );
    Ok(java)
}

#[tauri::command]
pub async fn list_forge_loaders(mc_version: String) -> Result<Vec<ForgeLoader>, String> {
    let client = reqwest::Client::builder()
        .user_agent("AquaClient/1.0")
        .build()
        .map_err(|e| e.to_string())?;
    let metadata = http_text(&client, &format!("{FORGE_MAVEN_BASE}/maven-metadata.xml")).await?;
    let recommended = resolve_forge_loader(&client, &mc_version, None).await.ok();
    Ok(extract_xml_versions(&metadata, &mc_version)
        .into_iter()
        .map(|version| ForgeLoader {
            recommended: recommended.as_deref() == Some(version.as_str()),
            version,
        })
        .collect())
}

#[tauri::command]
pub async fn install_version(
    app: AppHandle,
    loader: String,
    mc_version: String,
    fabric_loader_version: Option<String>,
    mc_dir: Option<String>,
) -> Result<(String, Option<String>), String> {
    let mc_dir = aqua_dir_from(mc_dir)?;
    std::fs::create_dir_all(&mc_dir).map_err(|e| e.to_string())?;

    let client = reqwest::Client::builder()
        .user_agent("AquaClient/1.0")
        .build()
        .map_err(|e| e.to_string())?;

    install_vanilla(&app, &client, &mc_version, &mc_dir).await?;

    if loader == "fabric" {
        let loader_version = match fabric_loader_version {
            Some(v) if !v.trim().is_empty() => {
                append_launcher_log(
                    "info",
                    "install",
                    &format!("Using specified Fabric loader version: {}", v),
                );
                v
            }
            _ => {
                append_launcher_log(
                    "info",
                    "install",
                    "Auto-selecting compatible Fabric loader version...",
                );
                let loaders = list_fabric_loaders(mc_version.clone()).await?;
                if loaders.is_empty() {
                    return Err(format!(
                        "No Fabric loader versions available for Minecraft {}",
                        mc_version
                    ));
                }
                let selected = if let Some(stable) = loaders.iter().find(|l| l.stable) {
                    stable.version.clone()
                } else {
                    loaders.first().unwrap().version.clone()
                };
                append_launcher_log(
                    "info",
                    "install",
                    &format!("Auto-selected Fabric loader version: {}", selected),
                );
                selected
            }
        };

        let profile_id =
            install_fabric_profile(&app, &client, &mc_version, &loader_version, &mc_dir).await?;
        ensure_java_for_profile(&app, &mc_dir, &profile_id, &mc_version).await?;
        emit_status(&app, "done", &format!("Installed {profile_id}"), 1, 1);
        Ok((profile_id, Some(loader_version)))
    } else if loader == "forge" {
        let forge_loader_version =
            resolve_forge_loader(&client, &mc_version, fabric_loader_version).await?;
        let profile_id =
            install_forge_profile(&app, &client, &mc_version, &forge_loader_version, &mc_dir)
                .await?;
        ensure_java_for_profile(&app, &mc_dir, &profile_id, &mc_version).await?;
        emit_status(&app, "done", &format!("Installed {profile_id}"), 1, 1);
        Ok((profile_id, Some(forge_loader_version)))
    } else {
        ensure_java_for_profile(&app, &mc_dir, &mc_version, &mc_version).await?;
        emit_status(&app, "done", &format!("Installed {mc_version}"), 1, 1);
        Ok((mc_version, None))
    }
}

async fn install_forge_profile(
    app: &AppHandle,
    client: &reqwest::Client,
    mc_version: &str,
    forge_loader_version: &str,
    mc_dir: &Path,
) -> Result<String, String> {
    let full_version = format!("{mc_version}-{forge_loader_version}");
    let profile_id = format!("{mc_version}-forge-{forge_loader_version}");
    let installer_name = format!("forge-{full_version}-installer.jar");
    let installer_url = format!("{FORGE_MAVEN_BASE}/{full_version}/{installer_name}");
    let installer_path = mc_dir
        .join("caches")
        .join("installers")
        .join(&installer_name);

    emit_status(app, "forge", "Downloading Forge installer", 0, 2);
    download_file(client, &installer_url, &installer_path, None).await?;

    emit_status(app, "forge", "Running Forge installer", 1, 2);
    let java = ensure_java(app.clone(), None, None, Some(mc_version.to_string())).await?;
    let output = Command::new(&java)
        .arg("-jar")
        .arg(&installer_path)
        .arg("--installClient")
        .current_dir(mc_dir)
        .output()
        .map_err(|e| format!("Failed to run Forge installer with {java}: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        return Err(format!(
            "Forge installer failed for Minecraft {mc_version} / Forge {forge_loader_version}.\n{stderr}\n{stdout}"
        ));
    }

    let expected = mc_dir
        .join("versions")
        .join(&profile_id)
        .join(format!("{profile_id}.json"));
    if expected.exists() {
        append_launcher_log(
            "info",
            "install",
            &format!("Installed Forge profile: {profile_id}"),
        );
        return Ok(profile_id);
    }

    let alternate = mc_dir
        .join("versions")
        .join(&full_version)
        .join(format!("{full_version}.json"));
    if alternate.exists() {
        append_launcher_log(
            "info",
            "install",
            &format!("Installed Forge profile: {full_version}"),
        );
        return Ok(full_version);
    }

    Err(format!(
        "Forge installer finished but no version profile was found for {profile_id}"
    ))
}

async fn install_vanilla(
    app: &AppHandle,
    client: &reqwest::Client,
    mc_version: &str,
    mc_dir: &Path,
) -> Result<(), String> {
    emit_status(
        app,
        "starting",
        &format!("Installing vanilla {mc_version}..."),
        0,
        0,
    );

    let version_dir = mc_dir.join("versions").join(mc_version);
    let json_path = version_dir.join(format!("{mc_version}.json"));
    let jar_path = version_dir.join(format!("{mc_version}.jar"));
    std::fs::create_dir_all(&version_dir).map_err(|e| e.to_string())?;

    let manifest = http_json(client, VERSION_MANIFEST_URL).await?;
    let version_url = manifest["versions"]
        .as_array()
        .and_then(|arr| arr.iter().find(|v| v["id"].as_str() == Some(mc_version)))
        .and_then(|v| v["url"].as_str())
        .ok_or_else(|| format!("Unknown Minecraft version: {mc_version}"))?;

    emit_status(app, "progress", "Fetching version JSON...", 0, 0);
    let version_json = if json_path.exists() {
        let raw = std::fs::read_to_string(&json_path).map_err(|e| e.to_string())?;
        serde_json::from_str(&raw).map_err(|e| e.to_string())?
    } else {
        let json = http_json(client, version_url).await?;
        std::fs::write(
            &json_path,
            serde_json::to_string_pretty(&json).map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?;
        json
    };

    if let Some(jar_url) = version_json["downloads"]["client"]["url"].as_str() {
        let jar_sha1 = version_json["downloads"]["client"]["sha1"].as_str();
        emit_status(
            app,
            "progress",
            &format!("Downloading {mc_version}.jar..."),
            0,
            0,
        );
        download_file(client, jar_url, &jar_path, jar_sha1).await?;
    }

    if let Some(libs) = version_json["libraries"].as_array() {
        let libs_root = mc_dir.join("libraries");
        let mut to_dl: Vec<(String, PathBuf, Option<String>)> = Vec::new();
        for lib in libs {
            if !library_allowed(lib) {
                continue;
            }
            for (url, path, sha1) in library_artifacts(lib) {
                to_dl.push((url, libs_root.join(path), sha1));
            }
        }
        download_many(app, client, to_dl, "library").await?;
    }

    let asset_index_id = version_json["assetIndex"]["id"]
        .as_str()
        .unwrap_or("legacy")
        .to_string();
    let asset_index_url = version_json["assetIndex"]["url"]
        .as_str()
        .unwrap_or("")
        .to_string();
    let asset_index_path = mc_dir
        .join("assets")
        .join("indexes")
        .join(format!("{asset_index_id}.json"));

    let asset_index: serde_json::Value = if asset_index_path.exists() {
        let raw = std::fs::read_to_string(&asset_index_path).map_err(|e| e.to_string())?;
        serde_json::from_str(&raw).map_err(|e| e.to_string())?
    } else if !asset_index_url.is_empty() {
        emit_status(app, "progress", "Fetching asset index...", 0, 0);
        let idx = http_json(client, &asset_index_url).await?;
        std::fs::create_dir_all(asset_index_path.parent().unwrap()).map_err(|e| e.to_string())?;
        std::fs::write(
            &asset_index_path,
            serde_json::to_string(&idx).map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?;
        idx
    } else {
        return Ok(());
    };

    if let Some(map) = asset_index["objects"].as_object() {
        let assets_root = mc_dir.join("assets").join("objects");
        let mut to_dl: Vec<(String, PathBuf, Option<String>)> = Vec::new();
        for (_name, info) in map {
            let Some(hash) = info["hash"].as_str() else {
                continue;
            };
            if hash.len() < 2 {
                continue;
            }
            let prefix = &hash[0..2];
            let dest = assets_root.join(prefix).join(hash);
            let url = format!("{RESOURCES_BASE}/{prefix}/{hash}");
            to_dl.push((url, dest, Some(hash.to_string())));
        }
        download_many(app, client, to_dl, "asset").await?;
    }

    Ok(())
}

fn loader_jar_path_from_profile(profile: &serde_json::Value, libs_root: &Path) -> Option<PathBuf> {
    if let Some(libs) = profile["libraries"].as_array() {
        for lib in libs {
            if let Some(name) = lib.get("name").and_then(|n| n.as_str()) {
                if name.starts_with("net.fabricmc:fabric-loader:") {
                    if let Some((_, path)) = library_artifact(lib) {
                        return Some(libs_root.join(path));
                    }
                }
            }
        }
    }
    None
}

async fn install_fabric_profile(
    app: &AppHandle,
    client: &reqwest::Client,
    mc_version: &str,
    loader_version: &str,
    mc_dir: &Path,
) -> Result<String, String> {
    emit_status(
        app,
        "progress",
        &format!("Preparing Fabric profile for {mc_version} / {loader_version}..."),
        0,
        0,
    );

    let inferred_profile_id = format!("fabric-loader-{loader_version}-{mc_version}");
    let profile_dir = mc_dir.join("versions").join(&inferred_profile_id);
    let json_path = profile_dir.join(format!("{inferred_profile_id}.json"));
    let libs_root = mc_dir.join("libraries");

    if json_path.exists() {
        emit_status(
            app,
            "progress",
            "Verifying existing Fabric installation...",
            0,
            0,
        );
        if let Ok(raw) = std::fs::read_to_string(&json_path) {
            if let Ok(profile) = serde_json::from_str::<serde_json::Value>(&raw) {
                let all_libs_present = profile["libraries"]
                    .as_array()
                    .map(|libs| {
                        libs.iter().all(|lib| {
                            if !library_allowed(lib) {
                                return true;
                            }
                            match library_artifact(lib) {
                                Some((_, path)) => libs_root.join(path).exists(),
                                None => true,
                            }
                        })
                    })
                    .unwrap_or(false);

                if all_libs_present {
                    if let Some(loader_jar) = loader_jar_path_from_profile(&profile, &libs_root) {
                        if loader_jar.exists() {
                            let knot_class =
                                "net/fabricmc/loader/impl/launch/knot/KnotClient.class";
                            if jar_contains_class(&loader_jar, knot_class)? {
                                emit_status(
                                    app,
                                    "progress",
                                    &format!(
                                        "Fabric profile already installed: {inferred_profile_id}"
                                    ),
                                    1,
                                    1,
                                );
                                return Ok(inferred_profile_id);
                            }
                        }
                    }
                }
            }
        }
    }

    emit_status(
        app,
        "progress",
        &format!("Fetching Fabric profile for {mc_version} / {loader_version}..."),
        0,
        0,
    );
    let url =
        format!("{FABRIC_META_BASE}/versions/loader/{mc_version}/{loader_version}/profile/json");
    let profile = http_json(client, &url).await?;
    let profile_id = profile["id"]
        .as_str()
        .unwrap_or(&inferred_profile_id)
        .to_string();

    let profile_dir = mc_dir.join("versions").join(&profile_id);
    std::fs::create_dir_all(&profile_dir).map_err(|e| e.to_string())?;
    let json_path = profile_dir.join(format!("{profile_id}.json"));
    std::fs::write(
        &json_path,
        serde_json::to_string_pretty(&profile).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;

    let mut to_dl: Vec<(String, PathBuf, Option<String>)> = Vec::new();
    let mut loader_jar: Option<PathBuf> = None;

    if let Some(libs) = profile["libraries"].as_array() {
        for lib in libs {
            if !library_allowed(lib) {
                continue;
            }

            let Some((url, path)) = library_artifact(lib) else {
                continue;
            };

            let sha1 = lib["downloads"]["artifact"]["sha1"]
                .as_str()
                .map(|s| s.to_string());
            let dest = libs_root.join(&path);
            if lib["name"]
                .as_str()
                .map(|name| name.starts_with("net.fabricmc:fabric-loader:"))
                .unwrap_or(false)
            {
                loader_jar = Some(dest.clone());
            }
            to_dl.push((url, dest, sha1));
        }
    }

    download_many(app, client, to_dl, "Fabric library").await?;

    let loader_jar = loader_jar.ok_or_else(|| {
        format!("Fabric profile {profile_id} did not declare net.fabricmc:fabric-loader")
    })?;
    if !loader_jar.exists() {
        return Err(format!(
            "Fabric Loader JAR was not downloaded: {}",
            loader_jar.display()
        ));
    }
    let knot_class = "net/fabricmc/loader/impl/launch/knot/KnotClient.class";
    if !jar_contains_class(&loader_jar, knot_class)? {
        return Err(format!(
            "Fabric Loader JAR does not contain {knot_class}: {}",
            loader_jar.display()
        ));
    }

    let _ = app.emit(
        "launch-log",
        serde_json::json!({
            "stream": "stdout",
            "line": format!("[aqua] Verified Fabric Loader {loader_version}: {}", loader_jar.display())
        }),
    );

    // Also write to persistent launcher logs
    append_launcher_log(
        "info",
        "install",
        &format!(
            "Verified Fabric Loader {loader_version}: {}",
            loader_jar.display()
        ),
    );

    emit_status(
        app,
        "progress",
        &format!("Installed Fabric profile {profile_id}"),
        1,
        1,
    );
    Ok(profile_id)
}

async fn download_many(
    app: &AppHandle,
    client: &reqwest::Client,
    to_dl: Vec<(String, PathBuf, Option<String>)>,
    label: &str,
) -> Result<(), String> {
    let total = to_dl.len() as u64;
    if total == 0 {
        return Ok(());
    }

    emit_status(
        app,
        "progress",
        &format!("Downloading {} {} files...", total, label),
        0,
        total,
    );

    let sem = Arc::new(Semaphore::new(DOWNLOAD_CONCURRENCY));
    let done = Arc::new(std::sync::atomic::AtomicU64::new(0));
    let mut tasks = Vec::new();

    for (url, dest, sha1) in to_dl {
        let sem2 = sem.clone();
        let app2 = app.clone();
        let client2 = client.clone();
        let done2 = done.clone();
        let label2 = label.to_string();
        tasks.push(tokio::spawn(async move {
            let _permit = sem2.acquire().await.ok();
            let result = download_file(&client2, &url, &dest, sha1.as_deref()).await;
            let n = done2.fetch_add(1, std::sync::atomic::Ordering::Relaxed) + 1;
            if n % 25 == 0 || n == total {
                emit_status(
                    &app2,
                    "progress",
                    &format!("Downloading {}s ({}/{})...", label2, n, total),
                    n,
                    total,
                );
            }
            result
        }));
    }

    for task in tasks {
        task.await.map_err(|e| e.to_string())??;
    }

    Ok(())
}

pub async fn ensure_version_libraries(
    app: &AppHandle,
    version_json: &serde_json::Value,
    mc_dir: &Path,
) -> Result<(), String> {
    let client = reqwest::Client::builder()
        .user_agent("AquaClient/1.0")
        .build()
        .map_err(|e| e.to_string())?;
    let mut to_dl = Vec::new();
    if let Some(libs) = version_json.get("libraries").and_then(|v| v.as_array()) {
        for lib in libs {
            if !library_allowed(lib) {
                continue;
            }
            for (url, path, sha1) in library_artifacts(lib) {
                to_dl.push((url, mc_dir.join("libraries").join(path), sha1));
            }
        }
    }
    download_many(app, &client, to_dl, "launch dependency").await
}
