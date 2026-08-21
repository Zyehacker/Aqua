use std::{
    fs,
    collections::{HashMap, HashSet},
    io::{Cursor, Read},
    path::{Path, PathBuf},
};

use reqwest::Url;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

use crate::settings::{append_launcher_log, atomic_write, default_mc_dir, instance_dir};
use crate::mods::read_metadata;
use crate::mods::{write_metadata, InstanceMetadata};

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
    pub compatibility: String,
    pub compatibility_reason: String,
    pub resolved_version_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalItem {
    pub name: String,
    pub path: String,
    pub size: u64,
}

fn version_parts(value: &str) -> Vec<u64> {
    value.trim().trim_start_matches(|character: char| !character.is_ascii_digit())
        .split(|character: char| !character.is_ascii_digit())
        .filter_map(|part| part.parse::<u64>().ok())
        .collect()
}

fn compare_versions(left: &str, right: &str) -> std::cmp::Ordering {
    let mut left_parts = version_parts(left);
    let mut right_parts = version_parts(right);
    let length = left_parts.len().max(right_parts.len());
    left_parts.resize(length, 0);
    right_parts.resize(length, 0);
    left_parts.cmp(&right_parts)
}

fn version_satisfies(version: &str, constraint: &str) -> bool {
    constraint.split("||").any(|alternative| {
        alternative.split_whitespace().all(|token| {
            let token = token.trim();
            if token.is_empty() || token == "*" { return true; }
            let (operator, required) = if let Some(value) = token.strip_prefix(">=") { (">=", value) }
                else if let Some(value) = token.strip_prefix("<=") { ("<=", value) }
                else if let Some(value) = token.strip_prefix('>') { (">", value) }
                else if let Some(value) = token.strip_prefix('<') { ("<", value) }
                else if let Some(value) = token.strip_prefix('=') { ("=", value) }
                else { ("=", token) };
            match compare_versions(version, required) {
                std::cmp::Ordering::Equal => matches!(operator, ">=" | "<=" | "="),
                std::cmp::Ordering::Greater => matches!(operator, ">=" | ">"),
                std::cmp::Ordering::Less => matches!(operator, "<=" | "<"),
            }
        })
    })
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct InstalledProject {
    project_id: String,
    version_id: String,
    filename: String,
}

#[derive(Debug, Clone)]
struct ResolvedFile {
    project_id: String,
    version_id: String,
    filename: String,
    url: String,
}

fn manifest_path(mods_dir: &Path) -> PathBuf {
    mods_dir.join(".aqua-modrinth.json")
}

fn read_installed_projects(mods_dir: &Path) -> Vec<InstalledProject> {
    fs::read_to_string(manifest_path(mods_dir))
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default()
}

fn write_installed_projects(mods_dir: &Path, projects: &[InstalledProject]) -> Result<(), String> {
    let data = serde_json::to_string_pretty(projects).map_err(|e| e.to_string())?;
    let path = manifest_path(mods_dir);
    atomic_write(&path, data.as_bytes())
}

fn archive_text(archive: &mut zip::ZipArchive<fs::File>, name: &str) -> Option<String> {
    let mut file = archive.by_name(name).ok()?;
    let mut raw = String::new();
    file.read_to_string(&mut raw).ok()?;
    Some(raw)
}

fn archive_mod_identity(path: &Path, loader: &str) -> Result<Option<(String, String)>, String> {
    if !path.extension().is_some_and(|extension| extension.eq_ignore_ascii_case("jar")) {
        return Ok(None);
    }
    let file = fs::File::open(path).map_err(|e| format!("Unable to inspect mod archive: {e}"))?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("Invalid mod archive: {e}"))?;
    match loader.trim().to_ascii_lowercase().as_str() {
        "fabric" => {
            let Some(raw) = archive_text(&mut archive, "fabric.mod.json") else { return Ok(None) };
            let metadata: serde_json::Value = serde_json::from_str(&raw).map_err(|e| format!("Invalid fabric.mod.json: {e}"))?;
            let Some(id) = metadata["id"].as_str() else { return Ok(None) };
            let version = metadata["version"].as_str().unwrap_or("unknown");
            Ok(Some((id.to_string(), version.to_string())))
        }
        "forge" => {
            let mut raw = None;
            for index in 0..archive.len() {
                if archive.by_index(index).ok().map(|entry| entry.name().ends_with("mods.toml")).unwrap_or(false) {
                    let name = archive.by_index(index).ok().map(|entry| entry.name().to_string());
                    if let Some(name) = name { raw = archive_text(&mut archive, &name); }
                    break;
                }
            }
            let Some(raw) = raw else { return Ok(None) };
            let field = |key: &str| raw.lines().find_map(|line| {
                let line = line.trim();
                let value = line.strip_prefix(key)?.split_once('=')?.1.trim().trim_matches('"');
                Some(value.to_string())
            });
            Ok(field("modId").map(|id| (id, field("version").unwrap_or_else(|| "unknown".to_string()))))
        }
        _ => Ok(None),
    }
}

fn validate_mod_archive(path: &Path, loader: &str) -> Result<(), String> {
    if !path.extension().is_some_and(|extension| extension.eq_ignore_ascii_case("jar")) {
        return Ok(());
    }
    let file = fs::File::open(path).map_err(|e| format!("Unable to inspect mod archive: {e}"))?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("Invalid mod archive: {e}"))?;
    match loader.trim().to_ascii_lowercase().as_str() {
        "fabric" => {
            let raw = archive_text(&mut archive, "fabric.mod.json")
                .ok_or_else(|| "Fabric mod is missing fabric.mod.json".to_string())?;
            let metadata: serde_json::Value = serde_json::from_str(&raw)
                .map_err(|e| format!("Invalid fabric.mod.json: {e}"))?;
            if metadata.get("id").and_then(|value| value.as_str()).is_none() {
                return Err("Fabric mod metadata has no mod id".to_string());
            }
        }
        "forge" => {
            let has_forge_metadata = (0..archive.len()).any(|index| {
                archive.by_index(index).ok().map(|entry| entry.name().ends_with("mods.toml")).unwrap_or(false)
            });
            if !has_forge_metadata {
                return Err("Forge mod is missing META-INF/mods.toml".to_string());
            }
        }
        _ => {}
    }
    Ok(())
}

fn compatible_version_for(version: &serde_json::Value, mc_version: &str, loader: &str, project_type: &str) -> (bool, &'static str) {
    let game_ok = version["game_versions"].as_array()
        .map(|values| values.iter().any(|value| value.as_str() == Some(mc_version)))
        .unwrap_or(false);
    if !game_ok {
        return (false, "minecraft_version_mismatch");
    }

    // Modrinth version loaders describe mod compatibility. Resource packs,
    // data packs, and shaders use their game-version metadata instead.
    let checks_loader = matches!(project_type, "mod" | "modpack");
    if checks_loader {
        let loader_key = normalize_loader(loader);
        let loader_ok = loader_key.is_empty() || loader_key == "vanilla" || version["loaders"].as_array()
            .map(|values| values.iter().any(|value| value.as_str().map(|value| value.eq_ignore_ascii_case(&loader_key)).unwrap_or(false)))
            .unwrap_or(false);
        if !loader_ok {
            return (false, "loader_mismatch");
        }
    }
    (true, "metadata_match")
}

#[cfg(test)]
fn compatible_version(version: &serde_json::Value, mc_version: &str, loader: &str) -> bool {
    compatible_version_for(version, mc_version, loader, "mod").0
}

fn normalize_loader(loader: &str) -> String {
    match loader.trim().to_ascii_lowercase().as_str() {
        "fabric" | "fabric loader" | "fabric-loader" => "fabric".to_string(),
        "forge" => "forge".to_string(),
        "neoforge" | "neo forge" | "neo-forge" => "neoforge".to_string(),
        "vanilla" => "vanilla".to_string(),
        other => other.to_string(),
    }
}

fn is_installable_download(filename: &str) -> bool {
    let lower = filename.to_ascii_lowercase();
    lower.ends_with(".jar") || lower.ends_with(".zip") || lower.ends_with(".mrpack")
}

fn sanitize_download_filename(filename: &str) -> String {
    let fallback = "downloaded-mod.jar";
    let candidate = Path::new(filename)
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or(filename)
        .trim();
    let cleaned: String = candidate.chars().filter(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.' | ' ')).collect();
    let cleaned = cleaned.trim();
    if cleaned.is_empty() { return fallback.to_string(); }
    let resolved = if cleaned.ends_with(".jar") || cleaned.ends_with(".zip") || cleaned.ends_with(".mrpack") {
        cleaned.to_string()
    } else if cleaned.contains('.') {
        format!("{cleaned}.jar")
    } else {
        format!("{cleaned}.jar")
    };
    resolved.replace("..", ".")
}

fn safe_replace_file(source: &Path, destination: &Path) -> Result<(), String> {
    if !source.exists() {
        return Err(format!("Missing downloaded file: {}", source.display()));
    }
    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    if destination.exists() {
        if destination == source {
            return Ok(());
        }
        fs::remove_file(destination).map_err(|e| format!("Unable to remove existing destination {}: {e}", destination.display()))?;
    }

    fs::rename(source, destination).map_err(|e| format!("Unable to move {} to {}: {e}", source.display(), destination.display()))?;
    Ok(())
}

fn version_file(version: &serde_json::Value) -> Option<(&str, &str)> {
    let files = version["files"].as_array()?;

    files.iter()
        .filter(|file| file["primary"].as_bool().unwrap_or(false))
        .find_map(|file| {
            let filename = file["filename"].as_str()?;
            let url = file["url"].as_str()?;
            is_installable_download(filename).then_some((filename, url))
        })
        .or_else(|| {
            files.iter().find_map(|file| {
                let filename = file["filename"].as_str()?;
                let url = file["url"].as_str()?;
                is_installable_download(filename).then_some((filename, url))
            })
        })
}

async fn project_versions(client: &reqwest::Client, project_id: &str) -> Result<Vec<serde_json::Value>, String> {
    client.get(format!("https://api.modrinth.com/v2/project/{project_id}/version"))
        .send().await.map_err(|e| format!("Modrinth request failed while resolving {project_id}: {e}"))?
        .error_for_status().map_err(|e| format!("Modrinth request failed while resolving {project_id}: {e}"))?
        .json().await.map_err(|e| format!("Modrinth response was invalid for {project_id}: {e}"))
}

async fn resolve_project(
    client: &reqwest::Client,
    project_id: &str,
    mc_version: &str,
    loader: &str,
    loader_version: Option<&str>,
    project_type: &str,
    instance_id: &str,
    selected: Option<&str>,
    installed: &HashSet<String>,
    visiting: &mut HashSet<String>,
    resolved: &mut HashMap<String, ResolvedFile>,
) -> Result<(), String> {
    if resolved.contains_key(project_id) {
        return Ok(());
    }
    if !visiting.insert(project_id.to_string()) {
        return Err(format!("Dependency conflict: cyclic dependency involving {project_id}"));
    }
    let versions = project_versions(client, project_id).await?;
    let mut candidates = Vec::new();
    for version in versions {
        let (compatible, reason) = compatible_version_for(&version, mc_version, loader, project_type);
        append_launcher_log(
            "info",
            "modrinth.compatibility",
            &format!(
                "instance_id={} minecraft_version={} loader={} loader_version={} project_id={} candidate_version={} game_versions={} loaders={} dependencies={} compatible={} reason={}",
                instance_id,
                mc_version,
                loader,
                loader_version.unwrap_or("automatic"),
                project_id,
                version["id"].as_str().unwrap_or("unknown"),
                version["game_versions"],
                version["loaders"],
                version["dependencies"],
                compatible,
                reason,
            ),
        );
        if let Some((filename, url)) = version_file(&version).map(|(filename, url)| (filename.to_string(), url.to_string())) {
            if compatible {
                candidates.push((version, filename, url));
            }
        }
    }
    candidates.sort_by(|a, b| {
        let a_release = a.0["version_type"].as_str() == Some("release");
        let b_release = b.0["version_type"].as_str() == Some("release");
        b_release.cmp(&a_release).then_with(|| b.0["date_published"].as_str().cmp(&a.0["date_published"].as_str()))
    });
    let (version, filename, url) = candidates.into_iter()
        .find(|(version, _, _)| selected.map(|value| version["id"].as_str() == Some(value)).unwrap_or(true))
        .ok_or_else(|| format!("No compatible version found for project {project_id} on Minecraft {mc_version} / {loader}"))?;

    if let Some(dependencies) = version["dependencies"].as_array() {
        for dependency in dependencies {
            let dependency_type = dependency["dependency_type"].as_str().unwrap_or("required");
            let dependency_project = dependency["project_id"].as_str();
            let dependency_version = dependency["version_id"].as_str();
            if dependency_type == "incompatible" {
                if let Some(project) = dependency_project {
                    if resolved.contains_key(project) || installed.contains(project) {
                        return Err(format!("Dependency conflict: {project} is incompatible with {project_id}"));
                    }
                }
                continue;
            }
            let Some(project) = dependency_project else { continue };
            if dependency_type == "optional" {
                continue;
            }
            Box::pin(resolve_project(client, project, mc_version, loader, loader_version, "mod", instance_id, dependency_version, installed, visiting, resolved)).await?;
        }
        for dependency in dependencies {
            if dependency["dependency_type"].as_str() != Some("incompatible") {
                continue;
            }
            if let Some(project) = dependency["project_id"].as_str() {
                if resolved.contains_key(project) || installed.contains(project) {
                    return Err(format!("Dependency conflict: {project} is incompatible with {project_id}"));
                }
            }
        }
    }
    visiting.remove(project_id);
    resolved.insert(project_id.to_string(), ResolvedFile {
        project_id: project_id.to_string(),
        version_id: version["id"].as_str().unwrap_or_default().to_string(),
        filename,
        url,
    });
    Ok(())
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
        "modpacks" => "modpack",
        "resource-packs" | "resourcepacks" | "texturepacks" => "resourcepack",
        "data-packs" | "datapacks" => "datapack",
        "shaders" => "shader",
        _ => "mod",
    }
}

fn folder_for(category: &str) -> &'static str {
    match category {
        "resource-packs" | "resourcepacks" | "texturepacks" => "resourcepacks",
        "data-packs" | "datapacks" => "datapacks",
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
                if entry.file_name().to_string_lossy() == ".aqua-modrinth.json" || entry.file_name().to_string_lossy().starts_with(".aqua-download-") {
                    continue;
                }
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
    instance_id: Option<String>,
    loader_version: Option<String>,
    mc_dir: Option<String>,
) -> Result<Vec<ModSearchResult>, String> {
    let client = reqwest::Client::builder()
        .user_agent("AquaClient/1.0")
        .build()
        .map_err(|e| e.to_string())?;

    let mc_root = mc_dir.clone().map(PathBuf::from).or_else(default_mc_dir);
    let (resolved_mc_version, raw_loader, _resolved_loader_version, instance_name) = if let Some(instance_id) = instance_id.as_deref() {
        let root = mc_root.as_ref().ok_or_else(|| "Instance metadata unavailable: Minecraft directory is not configured".to_string())?;
        let metadata = read_metadata(root, instance_id)
            .ok_or_else(|| format!("Instance '{}' not found. The instance metadata may have been deleted or moved.", instance_id))?;
        (metadata.mc_version, metadata.loader, metadata.loader_version, Some(metadata.name))
    } else {
        (mc_version, loader, loader_version, None)
    };
    let resolved_loader = normalize_loader(&raw_loader);
    if !resolved_loader.trim().is_empty() && !matches!(resolved_loader.as_str(), "vanilla" | "fabric" | "forge") {
        return Err(format!("Loader unavailable: {}", raw_loader));
    }

    let mut url = Url::parse("https://api.modrinth.com/v2/search").map_err(|e| e.to_string())?;
    {
        let mut qp = url.query_pairs_mut();
        qp.append_pair("query", &query);
        qp.append_pair("limit", &limit.unwrap_or(24).to_string());
        qp.append_pair("index", "relevance");

        let mut facets = vec![vec![format!("project_type:{}", project_type_for(&category))]];
        if !resolved_mc_version.trim().is_empty() {
            facets.push(vec![format!("versions:{}", resolved_mc_version)]);
        }
        if matches!(project_type_for(&category), "mod" | "modpack")
            && !resolved_loader.trim().is_empty() && resolved_loader != "vanilla"
        {
            facets.push(vec![format!("categories:{}", resolved_loader)]);
        }
        let facets = serde_json::to_string(&facets).map_err(|e| e.to_string())?;
        qp.append_pair("facets", &facets);
    }

    append_launcher_log(
        "info",
        "modrinth.search",
        &format!(
            "instance_id={} instance_name={} minecraft_version={} loader={} loader_version={} query={} request_url={}",
            instance_id.as_deref().unwrap_or("none"),
            instance_name.as_deref().unwrap_or("none"),
            resolved_mc_version,
            resolved_loader,
            _resolved_loader_version.as_deref().unwrap_or("automatic"),
            query,
            url,
        ),
    );

    let resp: serde_json::Value = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Modrinth request failed: {e}"))?
        .error_for_status()
        .map_err(|e| format!("Modrinth request failed: {e}"))?
        .json()
        .await
        .map_err(|e| format!("Modrinth response was invalid: {e}"))?;

    let wanted_type = project_type_for(&category).to_string();
    let hits = resp["hits"].as_array().cloned().unwrap_or_default();
    let had_hits = !hits.is_empty();
    let mut out = Vec::new();
    let mut projects_inspected = 0usize;
    let mut versions_inspected = 0usize;
    let mut minecraft_matches = 0usize;
    let mut loader_matches = 0usize;
    let mut compatible_versions = 0usize;

    for hit in hits {
        let project_type = hit["project_type"].as_str().unwrap_or("").to_string();
        if project_type != wanted_type {
            continue;
        }
        projects_inspected += 1;

        let id = hit["project_id"]
            .as_str()
            .or_else(|| hit["id"].as_str())
            .unwrap_or("")
            .to_string();

        let project_versions = project_versions(&client, &id)
            .await
            .map_err(|error| format!("Unable to reach Modrinth while resolving {id}: {error}"))?;
        versions_inspected += project_versions.len();
        minecraft_matches += project_versions.iter().filter(|version| version["game_versions"].as_array().map(|values| values.iter().any(|value| value.as_str() == Some(&resolved_mc_version))).unwrap_or(false)).count();
        loader_matches += project_versions.iter().filter(|version| version["loaders"].as_array().map(|values| values.iter().any(|value| value.as_str().map(|value| value.eq_ignore_ascii_case(&resolved_loader)).unwrap_or(false))).unwrap_or(false)).count();
        compatible_versions += project_versions.iter().filter(|version| compatible_version_for(version, &resolved_mc_version, &resolved_loader, &wanted_type).0 && version_file(version).is_some()).count();
        let resolved_version = project_versions
            .iter()
            .find(|version| compatible_version_for(version, &resolved_mc_version, &resolved_loader, &wanted_type).0 && version_file(version).is_some());
        if resolved_version.is_none() {
            let has_any_version = !project_versions.is_empty();
            let has_mc_match = project_versions.iter().any(|v| v["game_versions"].as_array().map(|values| values.iter().any(|value| value.as_str() == Some(&resolved_mc_version))).unwrap_or(false));
            let has_loader_match = !matches!(wanted_type.as_str(), "mod" | "modpack") || project_versions.iter().any(|v| v["loaders"].as_array().map(|values| values.iter().any(|value| value.as_str().map(|value| value.eq_ignore_ascii_case(&resolved_loader)).unwrap_or(false))).unwrap_or(false));
            let reason = if !has_any_version {
                "no_versions".to_string()
            } else if !has_mc_match {
                format!("no_minecraft_{}_version", resolved_mc_version)
            } else if !has_loader_match {
                format!("no_{}_loader_version", resolved_loader)
            } else {
                "no_compatible_combination".to_string()
            };
            append_launcher_log(
                "info",
                "modrinth.search.filtered",
                &format!(
                    "instance_id={} project_id={} minecraft_version={} loader={} accepted=false reason={}",
                    instance_id.as_deref().unwrap_or("none"),
                    id,
                    resolved_mc_version,
                    resolved_loader,
                    reason,
                ),
            );
            continue;
        }
        let resolved_version_id = resolved_version.and_then(|version| version["id"].as_str()).map(String::from);
        if resolved_version_id.is_none() {
            append_launcher_log(
                "warn",
                "modrinth.search.data_error",
                &format!("instance_id={} project_id={} issue=missing_version_id", instance_id.as_deref().unwrap_or("none"), id),
            );
            continue;
        }
        let resolved_game_versions = resolved_version
            .and_then(|version| version["game_versions"].as_array())
            .map(|versions| versions.iter().filter_map(|v| v.as_str().map(String::from)).collect::<Vec<_>>())
            .unwrap_or_default();
        let resolved_loaders = resolved_version
            .and_then(|version| version["loaders"].as_array())
            .map(|loaders_arr| loaders_arr.iter().filter_map(|l| l.as_str().map(String::from)).collect::<Vec<_>>())
            .unwrap_or_default();

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
            id: id.clone(),
            slug,
            title,
            description,
            icon_url,
            downloads,
            project_type,
            game_versions: resolved_game_versions,
            loaders: resolved_loaders.clone(),
            page_url,
            compatibility: "Compatible".to_string(),
            compatibility_reason: format!("Compatible with Minecraft {} and {}", resolved_mc_version, resolved_loader),
            resolved_version_id,
        });
        append_launcher_log(
            "info",
            "modrinth.search",
            &format!(
                "instance_id={} project_id={} project_type={} loaders={} accepted=true",
                instance_id.as_deref().unwrap_or("none"),
                id,
                wanted_type,
                resolved_loaders.iter().map(String::as_str).collect::<Vec<_>>().join(","),
            ),
        );
    }

    append_launcher_log(
        "info",
        "modrinth.search.summary",
        &format!(
            "instance_id={} minecraft_version={} loader={} projects_inspected={} versions_inspected={} minecraft_matches={} loader_matches={} compatible_versions={} accepted_projects={}",
            instance_id.as_deref().unwrap_or("none"),
            resolved_mc_version,
            resolved_loader,
            projects_inspected,
            versions_inspected,
            minecraft_matches,
            loader_matches,
            compatible_versions,
            out.len(),
        ),
    );

    if had_hits && projects_inspected > 0 && out.is_empty() {
        let context = if matches!(wanted_type.as_str(), "mod" | "modpack") {
            format!("Minecraft {} / {}", resolved_mc_version, resolved_loader)
        } else {
            format!("Minecraft {}", resolved_mc_version)
        };
        return Err(format!("No compatible versions found. All search results for {context} had incompatible versions. Try a different search term or check your instance configuration."));
    }
    Ok(out)
}

#[tauri::command]
pub fn list_instance_items(
    instance_id: String,   // renamed from mc_version
    category: String,
    mc_dir: Option<String>,
) -> Result<Vec<LocalItem>, String> {
    let mc_dir = target_mc_dir(mc_dir)?;
    let instance = read_metadata(&mc_dir, &instance_id)
        .and_then(|metadata| metadata.game_dir.map(PathBuf::from))
        .unwrap_or_else(|| instance_dir(&mc_dir, &instance_id));
    let folder = instance.join(folder_for(&category));
    fs::create_dir_all(&folder).map_err(|e| e.to_string())?;
    Ok(read_dir_items(&folder))
}

#[tauri::command]
pub fn remove_instance_item(
    path: String,
    instance_id: Option<String>,
    category: Option<String>,
    mc_dir: Option<String>,
) -> Result<(), String> {
    let instance_id = instance_id.ok_or_else(|| "An instance ID is required to remove content.".to_string())?;
    let category = category.ok_or_else(|| "A content category is required to remove content.".to_string())?;
    let root = target_mc_dir(mc_dir)?;
    let instance_root = read_metadata(&root, &instance_id)
        .and_then(|metadata| metadata.game_dir.map(PathBuf::from))
        .unwrap_or_else(|| instance_dir(&root, &instance_id));
    let allowed_root = instance_root.join(folder_for(&category));
    let p = PathBuf::from(path);
    if !p.starts_with(&allowed_root) {
        return Err("Content path is outside the selected instance category.".to_string());
    }
    if p.is_file() {
        fs::remove_file(&p).map_err(|e| e.to_string())?;
    } else {
        return Err("Content item was not found.".to_string());
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
        .error_for_status()
        .map_err(|e| format!("Modrinth download failed: {e}"))?
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
    mc_version: String,      // keep — used for Modrinth API filtering only
    instance_id: String,     // NEW parameter
    loader: String,
    loader_version: Option<String>,
    mc_dir: Option<String>,
    requested_name: Option<String>,
    icon_url: Option<String>,
) -> Result<String, String> {
    if category == "modpacks" {
        return install_modrinth_modpack(app, project_id, mc_version, mc_dir, requested_name.unwrap_or_else(|| "Imported Modpack".into()), icon_url).await;
    }
    if category == "data-packs" {
        return Err("Data packs must be installed into a selected Minecraft world; the current instance-level installer has no world target.".to_string());
    }
    if category == "mods" && (loader.trim().is_empty() || loader == "vanilla") {
        return Err("Mods require a mod loader. Create or select a Fabric, Forge, or other supported loader instance.".to_string());
    }
    let mc_dir = target_mc_dir(mc_dir)?;
    let metadata = read_metadata(&mc_dir, &instance_id)
        .ok_or_else(|| format!("Instance metadata not found: {instance_id}"))?;
    if metadata.mc_version != mc_version {
        return Err(format!("Instance Minecraft version {} does not match requested version {}", metadata.mc_version, mc_version));
    }
    if metadata.loader != loader {
        return Err(format!("Instance loader {} does not match requested loader {}", metadata.loader, loader));
    }
    // The instance loader version identifies the runtime profile. Modrinth
    // content versions are separate release versions and must not be compared
    // to Fabric/Forge loader versions.
    let instance = metadata.game_dir
        .map(PathBuf::from)
        .unwrap_or_else(|| instance_dir(&mc_dir, &instance_id));
    let folder = instance.join(folder_for(&category));
    fs::create_dir_all(&folder).map_err(|e| e.to_string())?;
    // rest of the function is unchanged

    let client = reqwest::Client::builder()
        .user_agent("AquaClient/1.0")
        .build()
        .map_err(|e| e.to_string())?;

    let mut installed = read_installed_projects(&folder);
    let installed_ids = installed.iter().map(|item| item.project_id.clone()).collect::<HashSet<_>>();
    let mut resolved = HashMap::new();
    Box::pin(resolve_project(&client, &project_id, &mc_version, &loader, loader_version.as_deref(), project_type_for(&category), &instance_id, None, &installed_ids, &mut HashSet::new(), &mut resolved)).await?;

    let mut installed_by_project = installed.iter().map(|item| (item.project_id.clone(), item.clone())).collect::<HashMap<_, _>>();
    let total = resolved.len() as u64;
    let mut completed = 0u64;
    let mut requested_destination = None;

    for file in resolved.values() {
        let safe_filename = sanitize_download_filename(&file.filename);
        let destination = folder.join(&safe_filename);
        if let Some(previous) = installed_by_project.get(&file.project_id) {
            if previous.version_id == file.version_id && destination.exists() {
                completed += 1;
                continue;
            }
            let previous_path = folder.join(&previous.filename);
            if previous_path.exists() && previous_path != destination {
                fs::remove_file(previous_path).map_err(|e| format!("Unable to replace installed dependency: {e}"))?;
            }
        }

        let temporary = folder.join(format!(".aqua-download-{}.part", safe_filename));
        let _ = fs::remove_file(&temporary);
        let _ = app.emit("install-status", serde_json::json!({
            "phase": "prepared",
            "message": format!("Preparing {}", safe_filename),
            "done": completed,
            "total": total
        }));

        let job_id = crate::download_manager::add_download(
            app.clone(),
            file.url.clone(),
            temporary.to_string_lossy().to_string(),
        ).await?;

        loop {
            let jobs = crate::download_manager::list_downloads()?;
            let job = jobs.iter().find(|job| job.id == job_id);
            match job {
                Some(job) => {
                    if job.status == "completed" {
                        break;
                    }
                    if matches!(job.status.as_str(), "failed" | "cancelled") {
                        return Err(job.error.clone().unwrap_or_else(|| format!("Download failed for {}", safe_filename)));
                    }
                    let percentage = job.percentage.unwrap_or(0.0).clamp(0.0, 100.0);
                    let _ = app.emit("install-status", serde_json::json!({
                        "phase": "downloading",
                        "message": format!("Downloading {} ({:.0}%)", safe_filename, percentage),
                        "done": completed,
                        "total": total,
                        "percentage": percentage,
                        "job_id": job_id,
                    }));
                }
                None => {
                    return Err(format!("Download job {} was not created for {}", job_id, file.filename));
                }
            }
            tokio::time::sleep(tokio::time::Duration::from_millis(150)).await;
        }

        validate_mod_archive(&temporary, &loader)?;
        let resolved_identity = archive_mod_identity(&temporary, &loader)?;
        if let Some((resolved_id, _)) = resolved_identity {
            if let Ok(entries) = fs::read_dir(&folder) {
                for entry in entries.flatten() {
                    let existing = entry.path();
                    if existing == destination || existing.extension().and_then(|value| value.to_str()) != Some("jar") {
                        continue;
                    }
                    if archive_mod_identity(&existing, &loader)?.map(|(id, _)| id == resolved_id).unwrap_or(false) {
                        fs::remove_file(existing).map_err(|e| format!("Unable to replace conflicting mod: {e}"))?;
                    }
                }
            }
        }

        let _ = app.emit("install-status", serde_json::json!({
            "phase": "installing",
            "message": format!("Installing {}", safe_filename),
            "done": completed,
            "total": total
        }));

        safe_replace_file(&temporary, &destination)?;

        installed_by_project.insert(file.project_id.clone(), InstalledProject {
            project_id: file.project_id.clone(),
            version_id: file.version_id.clone(),
            filename: safe_filename.clone(),
        });
        if file.project_id == project_id {
            requested_destination = Some(destination.to_string_lossy().to_string());
        }
        completed += 1;
    }

    installed = installed_by_project.into_values().collect();
    installed.sort_by(|a, b| a.project_id.cmp(&b.project_id));
    write_installed_projects(&folder, &installed)?;
    let _ = app.emit("install-status", serde_json::json!({
        "phase": "done",
        "message": format!("Installed {} with dependencies", project_id),
        "done": completed,
        "total": total
    }));
    requested_destination.ok_or_else(|| "Install plan did not contain the requested project".to_string())
}

pub async fn install_modrinth_modpack(
    app: AppHandle,
    project_id: String,
    mc_version: String,
    mc_dir: Option<String>,
    requested_name: String,
    icon_url: Option<String>,
) -> Result<String, String> {
    let root = target_mc_dir(mc_dir.clone())?;
    let client = reqwest::Client::builder().user_agent("AquaClient/1.0").build().map_err(|e| e.to_string())?;
    let versions: serde_json::Value = client.get(format!("https://api.modrinth.com/v2/project/{project_id}/version")).send().await.map_err(|e| e.to_string())?.json().await.map_err(|e| e.to_string())?;
    let version = versions.as_array().and_then(|items| items.iter().find(|item| {
        item["game_versions"].as_array().map(|values| values.iter().any(|value| value.as_str() == Some(mc_version.as_str()))).unwrap_or(false)
            && item["files"].as_array().and_then(|files| files.first()).and_then(|file| file["filename"].as_str()).map(|name| name.ends_with(".mrpack")).unwrap_or(false)
    })).ok_or_else(|| format!("No compatible modpack version found for Minecraft {mc_version}"))?;
    let loaders = version["loaders"].as_array().ok_or("Modpack does not declare a loader")?;
    let loader = if loaders.iter().any(|item| item.as_str() == Some("fabric")) { "fabric" } else if loaders.iter().any(|item| item.as_str() == Some("forge")) { "forge" } else { return Err("This modpack requires a loader Aqua cannot install yet.".into()) };
    let dependencies = version["dependencies"].as_object().ok_or("Modpack does not declare dependencies")?;
    let loader_version = dependencies.get(if loader == "fabric" { "fabric-loader" } else { "forge" }).and_then(|value| value.as_str()).map(String::from);
    let pack_url = version["files"].as_array().and_then(|files| files.iter().find_map(|file| file["url"].as_str())).ok_or("Modpack download URL missing")?;
    let pack_bytes = client.get(pack_url).send().await.map_err(|e| e.to_string())?.bytes().await.map_err(|e| e.to_string())?;
    let id = crate::mods::new_instance_id(&root);
    if read_metadata(&root, &id).is_some() || instance_dir(&root, &id).exists() { return Err(format!("Instance already exists: {id}")); }
    let (installed_version_id, resolved_loader) = crate::install::install_version(app.clone(), loader.to_string(), mc_version.clone(), loader_version, Some(root.to_string_lossy().to_string())).await?;
    let instance = instance_dir(&root, &id);
    fs::create_dir_all(&instance).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(Cursor::new(pack_bytes)).map_err(|e| format!("Invalid modpack archive: {e}"))?;
    let index: serde_json::Value = {
        let mut file = archive.by_name("modrinth.index.json").map_err(|_| "Modpack is missing modrinth.index.json")?;
        let mut raw = String::new(); file.read_to_string(&mut raw).map_err(|e| e.to_string())?;
        serde_json::from_str(&raw).map_err(|e| format!("Invalid modpack index: {e}"))?
    };
    let files = index["files"].as_array().ok_or("Modpack index has no files")?;
    for item in files {
        let path = item["path"].as_str().ok_or("Modpack file path missing")?;
        let downloads = item["downloads"].as_array().and_then(|values| values.first()).and_then(|value| value.as_str()).ok_or_else(|| format!("No download URL for {path}"))?;
        let destination = instance.join(path);
        download_to(&client, downloads, &destination).await?;
    }
    for prefix in ["overrides", "client-overrides"] {
        for index in 0..archive.len() {
            let mut entry = archive.by_index(index).map_err(|e| e.to_string())?;
            let Some(path) = entry.name().strip_prefix(&format!("{prefix}/")) else { continue };
            let destination = instance.join(path);
            if entry.is_dir() { fs::create_dir_all(&destination).map_err(|e| e.to_string())?; continue; }
            if let Some(parent) = destination.parent() { fs::create_dir_all(parent).map_err(|e| e.to_string())?; }
            let mut output = fs::File::create(destination).map_err(|e| e.to_string())?;
            std::io::copy(&mut entry, &mut output).map_err(|e| e.to_string())?;
        }
    }
    if let Some(url) = icon_url {
        if let Ok(response) = client.get(url).send().await {
            if let Ok(response) = response.error_for_status() {
                if let Ok(bytes) = response.bytes().await {
                    let _ = fs::write(instance.join("instance-icon.png"), bytes);
                }
            }
        }
    }
    let java_path = {
        let version_json = root.join("versions").join(&installed_version_id).join(format!("{installed_version_id}.json"));
        let metadata = fs::read_to_string(version_json).ok().and_then(|raw| serde_json::from_str::<serde_json::Value>(&raw).ok());
        let required = metadata.as_ref().map(|value| crate::java::get_required_java_major_from_metadata(&mc_version, value)).unwrap_or_else(|| crate::java::get_required_java_major(&mc_version));
        Some(crate::java::ensure_java_for_major(app.clone(), None, required).await?)
    };
    let timestamp = crate::settings::app_timestamp();
    let java_version = java_path.as_deref().and_then(|path| crate::java::check_java_runtime(Path::new(path), Some(&mc_version))).map(|runtime| runtime.version);
    write_metadata(&root, &InstanceMetadata { id: id.clone(), name: requested_name, mc_version: mc_version.clone(), loader: loader.into(), loader_version: resolved_loader, loader_mode: "manual".into(), installed_version_id, game_dir: None, java_runtime: java_path.clone(), java_path, java_version, memory_mb: None, java_args: None, install_state: Some("installed".into()), created_at: timestamp, updated_at: timestamp, last_played_at: None, })?;
    Ok(id)
}

pub async fn install_default_fabric_mods(
    app: AppHandle,
    mc_version: &str,
    loader_version: &str,
    instance_id: &str,
    mc_dir: &Path,
) -> Result<(), String> {
    for slug in ["fabric-api", "modmenu", "sodium", "lithium", "iris"] {
        let client = reqwest::Client::builder().user_agent("AquaClient/1.0").build().map_err(|e| e.to_string())?;
        let result = async {
            let project: serde_json::Value = client.get(format!("https://api.modrinth.com/v2/project/{slug}")).send().await
                .map_err(|e| e.to_string())?
                .error_for_status().map_err(|e| e.to_string())?
                .json().await.map_err(|e| e.to_string())?;
            let project_id = project["id"].as_str().ok_or_else(|| format!("Modrinth project not found: {slug}"))?.to_string();
            install_modrinth_project(
                app.clone(),
                project_id,
                "mods".into(),
                mc_version.into(),
                instance_id.to_string(),
                "fabric".into(),
                Some(loader_version.into()),
                Some(mc_dir.to_string_lossy().to_string()),
                None,
                project["icon_url"].as_str().map(String::from),
            ).await
        }.await;
        if let Err(error) = result {
            append_launcher_log("warn", "fabric.baseline", &format!("Skipped {slug}: {error}"));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{compatible_version, compatible_version_for, normalize_loader, version_file, version_satisfies};

    #[test]
    fn compatible_version_uses_game_version_and_loader() {
        let version = serde_json::json!({
            "game_versions": ["26.2"],
            "loaders": ["fabric"],
        });
        assert!(compatible_version(&version, "26.2", "fabric"));
        assert!(!compatible_version(&version, "26.1", "fabric"));
        assert!(!compatible_version(&version, "26.2", "forge"));
    }

    #[test]
    fn non_mod_content_uses_minecraft_version_without_loader_requirement() {
        let version = serde_json::json!({
            "game_versions": ["26.2"],
            "loaders": [],
        });

        for project_type in ["resourcepack", "datapack", "shader"] {
            assert_eq!(compatible_version_for(&version, "26.2", "fabric", project_type), (true, "metadata_match"));
        }
        assert_eq!(compatible_version_for(&version, "26.1", "fabric", "datapack").1, "minecraft_version_mismatch");
    }

    #[test]
    fn version_file_prefers_primary_download() {
        let version = serde_json::json!({
            "files": [
                { "filename": "sources.jar", "url": "https://example.invalid/sources.jar", "primary": false },
                { "filename": "mod.jar", "url": "https://example.invalid/mod.jar", "primary": true },
            ],
        });
        assert_eq!(version_file(&version), Some(("mod.jar", "https://example.invalid/mod.jar")));
    }

    #[test]
    fn loader_ranges_accept_compatible_versions() {
        assert!(version_satisfies("0.16.5", ">=0.16.0"));
        assert!(version_satisfies("47.2.0", ">=47.0 <48"));
        assert!(!version_satisfies("0.15.9", ">=0.16.0"));
    }

    #[test]
    fn loader_labels_normalize_for_modrinth() {
        assert_eq!(normalize_loader("Fabric"), "fabric");
        assert_eq!(normalize_loader("Fabric Loader"), "fabric");
        assert_eq!(normalize_loader("fabric-loader"), "fabric");
    }

    #[test]
    fn version_file_prefers_primary_installable_jar() {
        let version = serde_json::json!({
            "files": [
                { "filename": "fabric-api-1.0.jar", "url": "https://example.invalid/fabric-api-1.0.jar", "primary": false },
                { "filename": "fabric-api-1.0-sources.jar", "url": "https://example.invalid/fabric-api-1.0-sources.jar", "primary": false },
                { "filename": "fabric-api-metadata.json", "url": "https://example.invalid/fabric-api-metadata.json", "primary": true },
            ],
        });

        assert_eq!(version_file(&version), Some(("fabric-api-1.0.jar", "https://example.invalid/fabric-api-1.0.jar")));
    }
}
