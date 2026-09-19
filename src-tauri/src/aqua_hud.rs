use futures_util::StreamExt;
use serde::Serialize;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter};

// Direct download host for the 26.2 Fabric JAR. Serving the file directly (a
// non-HTML response) avoids the brittle file-page HTML scrape; resolve_file_response
// still falls back to page parsing only when a source returns HTML.
const AQUA_HUD_26_2_URL: &str = "https://download1479.mediafire.com/upyjlcmhbvzgVxZw6wkTuR_5tDsvXvtFk0ZDaaLPLRbS6dFavtnngCTBQ1wFxvgf1SLk8LiNVcuMPsa9k_iuAFOq2F0Wv7jZSn5bru5p0rzTxGJedddkXSq0Ek3PPzJP17QgXLWexyNPpwDA8Ja_Y5tp9ApciHNtoIi1wPaVCOtGAinjuw/Aqua+Hud+26.2+-+Fabric.jar";
const AQUA_HUD_1_21_11_URL: &str = "https://download1654.mediafire.com/utljv8qe3nbgnNl1lQY68f3sWGyl0yLgPW2e9oPw7sDV1e2fTTyjC3ilLZ9c5lsFT2MsIWlkReREZg8k8guhO1lLzWVGZE_I7rLUsEzY2g9LVFg4bLubrDB9mTyAXTkhE5gI7XOCRm3_DHMqLg_YZcOJhGUQ_9jrCmRgRs9VoCw_xPScEw/acquhe4hrr7rqe3/Aqua+Hud+1.21.11+-+Fabric.jar";

#[derive(Serialize, Clone)]
pub struct AquaHudInstallResult {
    pub version: String,
    pub path: String,
    pub already_installed: bool,
}

fn source_for(version: &str) -> Option<&'static str> {
    match version.trim() {
        "26.2" => Some(AQUA_HUD_26_2_URL),
        "1.21.11" => Some(AQUA_HUD_1_21_11_URL),
        _ => None,
    }
}

fn emit(app: &AppHandle, phase: &str, message: &str, percent: Option<f64>) {
    let _ = app.emit(
        "aqua-hud-progress",
        serde_json::json!({ "phase": phase, "message": message, "percent": percent }),
    );
}

fn is_valid_jar(path: &Path) -> bool {
    let Ok(file) = std::fs::File::open(path) else { return false };
    if std::fs::metadata(path).map(|meta| meta.len() > 0).unwrap_or(false) == false { return false }
    zip::ZipArchive::new(file).is_ok()
}

fn candidate_links(html: &str, base: &reqwest::Url) -> Vec<reqwest::Url> {
    html.split(['"', '\''])
        .filter_map(|part| {
            let value = part.replace("&amp;", "&");
            if !(value.starts_with("http://") || value.starts_with("https://") || value.starts_with('/')) { return None }
            if !value.to_lowercase().contains(".jar") && !value.to_lowercase().contains("download") { return None }
            base.join(&value).ok()
        })
        .collect()
}

async fn resolve_file_response(client: &reqwest::Client, source: &str) -> Result<reqwest::Response, String> {
    let response = client.get(source).send().await.map_err(|error| format!("Aqua HUD source request failed: {error}"))?;
    if !response.status().is_success() { return Err(format!("Aqua HUD source returned HTTP {}", response.status())) }
    let content_type = response.headers().get(reqwest::header::CONTENT_TYPE).and_then(|value| value.to_str().ok()).unwrap_or("").to_lowercase();
    if !content_type.contains("html") { return Ok(response) }
    let base = response.url().clone();
    let html = response.text().await.map_err(|error| format!("Unable to read Aqua HUD download page: {error}"))?;
    for candidate in candidate_links(&html, &base).into_iter().take(5) {
        let result = client.get(candidate).send().await.map_err(|error| error.to_string())?;
        if result.status().is_success() {
            let content_type = result.headers().get(reqwest::header::CONTENT_TYPE).and_then(|value| value.to_str().ok()).unwrap_or("").to_lowercase();
            if !content_type.contains("html") { return Ok(result) }
        }
    }
    Err("MediaFire did not expose a downloadable Aqua HUD JAR.".to_string())
}

#[tauri::command]
pub async fn install_aqua_hud(
    app: AppHandle,
    instance_id: String,
    mc_version: String,
    mc_dir: Option<String>,
) -> Result<AquaHudInstallResult, String> {
    let source = source_for(&mc_version).ok_or_else(|| format!("Aqua HUD is not configured for Minecraft {mc_version}."))?;
    let root = mc_dir.map(PathBuf::from).or_else(crate::settings::default_mc_dir).ok_or_else(|| "Could not determine the Minecraft directory.".to_string())?;
    let metadata = crate::mods::read_metadata(&root, &instance_id).ok_or_else(|| format!("Instance metadata not found: {instance_id}"))?;
    let game_dir = metadata.game_dir.map(PathBuf::from).unwrap_or_else(|| crate::settings::instance_dir(&root, &instance_id));
    let mods_dir = game_dir.join("mods");
    std::fs::create_dir_all(&mods_dir).map_err(|error| format!("Unable to create mods directory: {error}"))?;
    let filename = format!("Aqua-Hud-{mc_version}-Fabric.jar");
    let destination = mods_dir.join(filename);
    if is_valid_jar(&destination) {
        emit(&app, "complete", "Aqua HUD is already installed.", Some(100.0));
        return Ok(AquaHudInstallResult { version: mc_version, path: destination.to_string_lossy().to_string(), already_installed: true });
    }

    let partial = destination.with_extension("jar.part");
    let _ = std::fs::remove_file(&partial);
    emit(&app, "starting", "Downloading Aqua HUD…", Some(0.0));
    let client = reqwest::Client::builder().user_agent("AquaClient/2.0").redirect(reqwest::redirect::Policy::limited(10)).build().map_err(|error| error.to_string())?;
    let response = resolve_file_response(&client, source).await?;
    let total = response.content_length();
    let mut stream = response.bytes_stream();
    let mut file = std::fs::File::create(&partial).map_err(|error| error.to_string())?;
    let mut downloaded = 0u64;
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|error| { let _ = std::fs::remove_file(&partial); format!("Aqua HUD download failed: {error}") })?;
        std::io::Write::write_all(&mut file, &chunk).map_err(|error| { let _ = std::fs::remove_file(&partial); error.to_string() })?;
        downloaded += chunk.len() as u64;
        emit(&app, "downloading", "Downloading Aqua HUD…", total.map(|size| ((downloaded as f64 / size as f64) * 100.0).clamp(0.0, 99.0)));
    }
    std::io::Write::flush(&mut file).map_err(|error| error.to_string())?;
    drop(file);
    if !is_valid_jar(&partial) {
        let _ = std::fs::remove_file(&partial);
        return Err("Aqua HUD download was not a valid JAR/ZIP file.".to_string());
    }
    std::fs::rename(&partial, &destination).map_err(|error| { let _ = std::fs::remove_file(&partial); error.to_string() })?;
    emit(&app, "complete", "Aqua HUD installed.", Some(100.0));
    Ok(AquaHudInstallResult { version: mc_version, path: destination.to_string_lossy().to_string(), already_installed: false })
}
