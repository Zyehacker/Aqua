use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::Mutex;

use tauri::{AppHandle, Emitter, Manager, State};

use crate::auth::load_account_file;
use crate::java::ensure_java;
use crate::settings::{default_mc_dir, instance_dir, Settings};

pub struct LaunchState {
    pub running: Mutex<bool>,
}

fn current_os_str() -> &'static str {
    if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "osx"
    } else {
        "linux"
    }
}

pub fn library_allowed(lib: &serde_json::Value) -> bool {
    let Some(rules) = lib.get("rules").and_then(|r| r.as_array()) else { return true; };
    let current = current_os_str();
    let mut allowed = false;
    for rule in rules {
        let action_allow = rule.get("action").and_then(|a| a.as_str()) == Some("allow");
        let matches = match rule.get("os").and_then(|o| o.get("name")).and_then(|n| n.as_str()) {
            Some(name) => name == current,
            None => true,
        };
        if matches {
            allowed = action_allow;
        }
    }
    allowed
}

fn offline_uuid(name: &str) -> String {
    let input = format!("OfflinePlayer:{}", name);
    let digest = md5::compute(input.as_bytes());
    let mut bytes: [u8; 16] = digest.0;
    bytes[6] = (bytes[6] & 0x0f) | 0x30;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    format!(
        "{:02x}{:02x}{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}",
        bytes[0], bytes[1], bytes[2], bytes[3],
        bytes[4], bytes[5], bytes[6], bytes[7],
        bytes[8], bytes[9],
        bytes[10], bytes[11], bytes[12], bytes[13], bytes[14], bytes[15],
    )
}

fn effective_version_id(settings: &Settings) -> String {
    if settings.loader_type == "fabric" {
        let base = settings.version.trim();
        let loader = settings.fabric_loader_version.clone().unwrap_or_default();
        if base.to_lowercase().contains("fabric-loader") || loader.trim().is_empty() {
            base.to_string()
        } else {
            format!("fabric-loader-{}-{}", loader.trim(), base)
        }
    } else {
        settings.version.clone()
    }
}

#[tauri::command]
pub async fn launch_minecraft(
    app: AppHandle,
    state: State<'_, LaunchState>,
    settings: Settings,
) -> Result<(), String> {
    {
        let mut running = state.running.lock().map_err(|e| e.to_string())?;
        if *running {
            return Err("Minecraft is already running.".into());
        }
        *running = true;
    }

let _ = app.emit("launch-status", serde_json::json!({
    "phase": "checking",
    "message": "Resolving Java..."
}));

    let result = build_and_spawn(&app, &settings).await;
    if let Err(e) = &result {
        if let Ok(mut running) = state.running.lock() {
            *running = false;
        }
        let _ = app.emit("launch-status", serde_json::json!({"phase": "error", "message": e}));
    }
    result
}

#[tauri::command]
pub fn is_running(state: State<'_, LaunchState>) -> bool {
    state.running.lock().map(|g| *g).unwrap_or(false)
}

fn load_effective_version_json(
    mc_dir: &std::path::Path,
    version_id: &str,
) -> Result<(serde_json::Value, PathBuf), String> {
    let version_dir = mc_dir.join("versions").join(version_id);
    let json_path = version_dir.join(format!("{version_id}.json"));
    if !json_path.exists() {
        return Err(format!("Version JSON not found: {}", json_path.display()));
    }

    let raw = std::fs::read_to_string(&json_path).map_err(|e| e.to_string())?;
    let mut child: serde_json::Value = serde_json::from_str(&raw).map_err(|e| e.to_string())?;

    if let Some(parent_id) = child.get("inheritsFrom").and_then(|v| v.as_str()).map(String::from) {
        let (parent, _parent_dir) = load_effective_version_json(mc_dir, &parent_id)?;

        let mut merged_libs = Vec::new();
        if let Some(arr) = child.get("libraries").and_then(|v| v.as_array()) {
            merged_libs.extend(arr.iter().cloned());
        }
        if let Some(arr) = parent.get("libraries").and_then(|v| v.as_array()) {
            merged_libs.extend(arr.iter().cloned());
        }
        child["libraries"] = serde_json::Value::Array(merged_libs);

        if child.get("assetIndex").is_none() {
            if let Some(p) = parent.get("assetIndex") {
                child["assetIndex"] = p.clone();
            }
        }
        if child.get("assets").is_none() {
            if let Some(p) = parent.get("assets") {
                child["assets"] = p.clone();
            }
        }
        if child.get("mainClass").and_then(|v| v.as_str()).map(str::is_empty).unwrap_or(true) {
            if let Some(p) = parent.get("mainClass") {
                child["mainClass"] = p.clone();
            }
        }
    }

    Ok((child, version_dir))
}

fn maven_path_from_coord(coord: &str) -> String {
    let (coord, ext) = match coord.split_once('@') {
        Some((c, e)) => (c, e.to_string()),
        None => (coord, "jar".to_string()),
    };
    let parts: Vec<&str> = coord.split(':').collect();
    if parts.len() < 3 {
        return String::new();
    }
    let group = parts[0].replace('.', "/");
    let artifact = parts[1];
    let version = parts[2];
    let classifier = parts.get(3).copied();
    let filename = match classifier {
        Some(c) => format!("{artifact}-{version}-{c}.{ext}"),
        None => format!("{artifact}-{version}.{ext}"),
    };
    format!("{group}/{artifact}/{version}/{filename}")
}

fn native_extensions() -> &'static [&'static str] {
    if cfg!(target_os = "windows") {
        &["dll"]
    } else if cfg!(target_os = "macos") {
        &["dylib", "jnilib"]
    } else {
        &["so"]
    }
}

fn native_library_path(lib: &serde_json::Value) -> Option<String> {
    if !library_allowed(lib) {
        return None;
    }

    let current_classifier = if cfg!(target_os = "windows") {
        "natives-windows"
    } else if cfg!(target_os = "macos") {
        "natives-macos"
    } else {
        "natives-linux"
    };

    if let Some(name) = lib.get("name").and_then(|n| n.as_str()) {
        let parts: Vec<&str> = name.split(':').collect();
        if parts.len() >= 4 {
            let cls = parts[3];
            let matches = cls == current_classifier || (cfg!(target_os = "macos") && cls == "natives-osx");
            if matches {
                if let Some(p) = lib.get("downloads")
                    .and_then(|d| d.get("artifact"))
                    .and_then(|a| a.get("path"))
                    .and_then(|p| p.as_str())
                {
                    return Some(p.to_string());
                }
            }
        }
    }

    let key = if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "osx"
    } else {
        "linux"
    };
    if let Some(cls) = lib.get("natives").and_then(|n| n.get(key)).and_then(|c| c.as_str()) {
        if let Some(p) = lib.get("downloads")
            .and_then(|d| d.get("classifiers"))
            .and_then(|c| c.get(cls))
            .and_then(|a| a.get("path"))
            .and_then(|p| p.as_str())
        {
            return Some(p.to_string());
        }
    }

    None
}

fn extract_jar_natives(
    jar: &std::path::Path,
    dest: &std::path::Path,
    exts: &[&str],
) -> std::io::Result<()> {
    let file = std::fs::File::open(jar)?;
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e.to_string()))?;

    for i in 0..archive.len() {
        let mut entry = archive.by_index(i)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e.to_string()))?;
        if entry.is_dir() {
            continue;
        }
        let name = entry.name().to_string();
        if name.starts_with("META-INF/") || name.starts_with("module-info") {
            continue;
        }
        let lower = name.to_lowercase();
        if !exts.iter().any(|ext| lower.ends_with(&format!(".{ext}"))) {
            continue;
        }
        if let Some(fname) = std::path::Path::new(&name).file_name().and_then(|s| s.to_str()) {
            let out = dest.join(fname);
            let mut buf = Vec::new();
            use std::io::Read;
            entry.read_to_end(&mut buf)?;
            std::fs::write(out, buf)?;
        }
    }

    Ok(())
}

fn extract_natives(
    libraries: &[serde_json::Value],
    libs_root: &std::path::Path,
    natives_dir: &std::path::Path,
) -> std::io::Result<()> {
    let exts = native_extensions();
    for lib in libraries {
        let Some(rel) = native_library_path(lib) else { continue; };
        let jar = libs_root.join(&rel);
        if !jar.exists() {
            continue;
        }
        if let Err(e) = extract_jar_natives(&jar, natives_dir, exts) {
            eprintln!("[aqua] failed to extract {}: {e}", jar.display());
        }
    }
    Ok(())
}

async fn build_and_spawn(app: &AppHandle, settings: &Settings) -> Result<(), String> {
    let mc_dir = settings.mc_dir.clone()
        .map(PathBuf::from)
        .or_else(default_mc_dir)
        .ok_or_else(|| "Could not determine .minecraft directory.".to_string())?;

    let _ = std::fs::create_dir_all(&mc_dir);

    let effective_version = effective_version_id(settings);

    let java = ensure_java(
        app.clone(),
        settings.java_path.clone(),
        settings.java_runtime.clone(),
        Some(settings.version.clone()),
    ).await?;

    let (v, version_dir) = load_effective_version_json(&mc_dir, &effective_version)?;

    let parent_id = v.get("inheritsFrom").and_then(|p| p.as_str()).map(String::from);
    let (jar_owner_dir, jar_owner_id) = match &parent_id {
        Some(pid) => (mc_dir.join("versions").join(pid), pid.clone()),
        None => (version_dir.clone(), effective_version.clone()),
    };
    let version_jar_path = jar_owner_dir.join(format!("{}.jar", jar_owner_id));
    if !version_jar_path.exists() {
        return Err(format!(
            "Version JAR not found at {}\nUse Install to download this version first.",
            version_jar_path.display()
        ));
    }

    let main_class = v.get("mainClass").and_then(|m| m.as_str())
        .unwrap_or("net.minecraft.client.main.Main").to_string();

    let asset_index = v.get("assetIndex").and_then(|a| a.get("id")).and_then(|i| i.as_str())
        .or_else(|| v.get("assets").and_then(|a| a.as_str()))
        .unwrap_or("legacy").to_string();

    let libs_root = mc_dir.join("libraries");
    let mut classpath: Vec<PathBuf> = Vec::new();
    let mut seen_ga: std::collections::HashSet<String> = std::collections::HashSet::new();
    if let Some(libs) = v.get("libraries").and_then(|l| l.as_array()) {
        for lib in libs {
            if !library_allowed(lib) { continue; }

            let path = lib.get("downloads")
                .and_then(|d| d.get("artifact"))
                .and_then(|a| a.get("path"))
                .and_then(|p| p.as_str())
                .map(String::from)
                .or_else(|| lib.get("name").and_then(|n| n.as_str()).map(maven_path_from_coord));
            let Some(path) = path else { continue };

            let ga = if let Some(name) = lib.get("name").and_then(|n| n.as_str()) {
                let parts: Vec<&str> = name.splitn(3, ':').collect();
                if parts.len() >= 2 { format!("{}:{}", parts[0], parts[1]) } else { path.clone() }
            } else {
                path.clone()
            };
            if !seen_ga.insert(ga) { continue; }
            let full = libs_root.join(&path);
            if full.exists() { classpath.push(full); }
        }
    }
    classpath.push(version_jar_path);
    let cp_sep = if cfg!(windows) { ";" } else { ":" };
    let cp_str = classpath.iter()
        .map(|p| p.to_string_lossy().to_string())
        .collect::<Vec<_>>()
        .join(cp_sep);

    let mut cmd = Command::new(&java);
    let ram = settings.ram_mb.max(512);
    cmd.arg(format!("-Xmx{}M", ram));
    cmd.arg("-Xms512M");
    for arg in settings.jvm_args.split_whitespace() {
        if !arg.trim().is_empty() {
            cmd.arg(arg.trim());
        }
    }

    let natives_dir = version_dir.join("natives");
    let _ = std::fs::create_dir_all(&natives_dir);
    if let Some(libs) = v.get("libraries").and_then(|l| l.as_array()) {
        if let Err(e) = extract_natives(libs, &libs_root, &natives_dir) {
            let _ = app.emit("launch-log",
                serde_json::json!({"stream": "stderr", "line": format!("[aqua] natives extract warning: {e}")}));
        }
    }
    cmd.arg(format!("-Djava.library.path={}", natives_dir.display()));
    cmd.arg(format!("-Djna.tmpdir={}", natives_dir.display()));
    cmd.arg(format!("-Dorg.lwjgl.system.SharedLibraryExtractPath={}", natives_dir.display()));
    cmd.arg(format!("-Dio.netty.native.workdir={}", natives_dir.display()));

    cmd.arg("-cp").arg(&cp_str);
    cmd.arg(&main_class);

    let active = load_account_file(app);
    let (username, uuid, access_token, user_type) = match active {
        Some(acc) => (acc.username, acc.uuid, acc.mc_access_token, "msa".to_string()),
        None => {
            let u = if settings.username.trim().is_empty() {
                "AquaPlayer".to_string()
            } else { settings.username.clone() };
            let id = offline_uuid(&u);
            (u, id, "0".to_string(), "legacy".to_string())
        }
    };

    let game_dir = instance_dir(&mc_dir, &effective_version);
    let _ = std::fs::create_dir_all(game_dir.join("mods"));
    let _ = std::fs::create_dir_all(game_dir.join("resourcepacks"));
    let _ = std::fs::create_dir_all(game_dir.join("shaderpacks"));

    cmd.arg("--username").arg(&username);
    cmd.arg("--version").arg(&effective_version);
    cmd.arg("--gameDir").arg(&game_dir);
    cmd.arg("--assetsDir").arg(mc_dir.join("assets"));
    cmd.arg("--assetIndex").arg(&asset_index);
    cmd.arg("--uuid").arg(&uuid);
    cmd.arg("--accessToken").arg(&access_token);
    cmd.arg("--userType").arg(&user_type);
    cmd.arg("--versionType").arg("release");

    cmd.current_dir(&game_dir);
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    let _ = app.emit("launch-status", serde_json::json!({
        "phase": "starting",
        "message": "Spawning Java..."
    }));

    let mut child = cmd.spawn().map_err(|e| {
        format!("Failed to start Java ({java}): {e}\nMake sure Java is installed and available, or set the Java path in Settings.")
    })?;

    let _ = app.emit("launch-status", serde_json::json!({
        "phase": "running",
        "message": "Minecraft running"
    }));

    if let Some(out) = child.stdout.take() {
        let app2 = app.clone();
        std::thread::spawn(move || {
            for line in BufReader::new(out).lines().map_while(Result::ok) {
                let _ = app2.emit("launch-log",
                    serde_json::json!({"stream": "stdout", "line": line}));
            }
        });
    }
    if let Some(err) = child.stderr.take() {
        let app2 = app.clone();
        std::thread::spawn(move || {
            for line in BufReader::new(err).lines().map_while(Result::ok) {
                let _ = app2.emit("launch-log",
                    serde_json::json!({"stream": "stderr", "line": line}));
            }
        });
    }

    let app3 = app.clone();
    std::thread::spawn(move || {
        let code = child.wait().ok().and_then(|s| s.code()).unwrap_or(-1);
        if let Some(state) = app3.try_state::<LaunchState>() {
            if let Ok(mut running) = state.running.lock() { *running = false; }
        }
        let _ = app3.emit("launch-status",
            serde_json::json!({"phase": "exited", "code": code,
                "message": format!("Minecraft exited (code {code}).")}));
    });

    Ok(())
}
