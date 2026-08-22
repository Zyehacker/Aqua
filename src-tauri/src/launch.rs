use std::collections::VecDeque;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use tauri::{AppHandle, Emitter, Manager, State};

use crate::auth::load_account_file;
use crate::java::{ensure_java_for_major, get_required_java_major_from_metadata};
use crate::settings::{append_launcher_log, atomic_write, default_mc_dir, instance_dir, Settings};

pub struct LaunchState {
    pub running: Mutex<bool>,
    pub child_pid: Mutex<Option<u32>>,
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

fn current_arch_str() -> &'static str {
    match std::env::consts::ARCH {
        "x86_64" => "x86_64",
        "x86" => "x86",
        "aarch64" => "arm64",
        "arm" => "arm32",
        other => other,
    }
}

pub fn library_allowed(lib: &serde_json::Value) -> bool {
    let Some(rules) = lib.get("rules").and_then(|r| r.as_array()) else {
        return true;
    };
    let current = current_os_str();
    let mut allowed = false;
    for rule in rules {
        let action_allow = rule.get("action").and_then(|a| a.as_str()) == Some("allow");
        let matches = match rule
            .get("os")
            .and_then(|o| o.get("name"))
            .and_then(|n| n.as_str())
        {
            Some(name) => name == current,
            None => true,
        };
        let arch_matches = match rule
            .get("os")
            .and_then(|o| o.get("arch"))
            .and_then(|a| a.as_str())
        {
            Some(arch) => arch == current_arch_str(),
            None => true,
        };
        if matches && arch_matches {
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
    } else if settings.loader_type == "forge" {
        let base = settings.version.trim();
        let loader = settings.fabric_loader_version.clone().unwrap_or_default();
        if base.to_lowercase().contains("forge")
            || loader.trim().is_empty()
            || settings.instance_id.is_some()
        {
            base.to_string()
        } else {
            format!("{}-forge-{}", base, loader.trim())
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

    let _ = app.emit(
        "launch-status",
        serde_json::json!({
            "phase": "checking",
            "message": "Resolving Java..."
        }),
    );
    append_launcher_log("info", "launch", "Resolving Java...");

    let result = build_and_spawn(&app, &settings).await;
    if let Err(e) = &result {
        if let Ok(mut running) = state.running.lock() {
            *running = false;
        }
        append_launcher_log("error", "launch", e);
        let _ = app.emit(
            "launch-status",
            serde_json::json!({"phase": "error", "message": e}),
        );
    }
    result
}

#[tauri::command]
pub fn is_running(state: State<'_, LaunchState>) -> bool {
    state.running.lock().map(|g| *g).unwrap_or(false)
}

#[tauri::command]
pub fn stop_minecraft(state: State<'_, LaunchState>) -> Result<(), String> {
    let pid = state.child_pid.lock().map_err(|e| e.to_string())?.take();
    let Some(pid) = pid else {
        return Err("Minecraft is not running.".to_string());
    };

    let result = if cfg!(windows) {
        Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .output()
    } else {
        Command::new("kill")
            .args(["-TERM", &pid.to_string()])
            .output()
    };
    result
        .map_err(|e| format!("Unable to stop Minecraft: {e}"))
        .and_then(|output| {
            if output.status.success() {
                Ok(())
            } else {
                Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
            }
        })
}

fn load_effective_version_json(
    mc_dir: &std::path::Path,
    version_id: &str,
) -> Result<(serde_json::Value, PathBuf), String> {
    let mut visiting = std::collections::HashSet::new();
    load_effective_version_json_inner(mc_dir, version_id, &mut visiting)
}

fn load_effective_version_json_inner(
    mc_dir: &std::path::Path,
    version_id: &str,
    visiting: &mut std::collections::HashSet<String>,
) -> Result<(serde_json::Value, PathBuf), String> {
    if !visiting.insert(version_id.to_string()) {
        return Err(format!(
            "Cyclic Minecraft version inheritance detected at '{version_id}'"
        ));
    }
    let versions_root = mc_dir.join("versions");
    let direct_dir = versions_root.join(version_id);
    let direct_json = direct_dir.join(format!("{version_id}.json"));
    let (version_dir, json_path) = if direct_json.exists() {
        (direct_dir, direct_json)
    } else {
        let mut found: Option<(PathBuf, PathBuf)> = None;
        if let Ok(entries) = std::fs::read_dir(&versions_root) {
            'profiles: for entry in entries.flatten() {
                if !entry.file_type().map(|kind| kind.is_dir()).unwrap_or(false) {
                    continue;
                }
                let dir = entry.path();
                let Ok(files) = std::fs::read_dir(&dir) else {
                    continue;
                };
                for file in files.flatten() {
                    let path = file.path();
                    if path.extension().and_then(|ext| ext.to_str()) != Some("json") {
                        continue;
                    }
                    let Ok(raw) = std::fs::read_to_string(&path) else {
                        continue;
                    };
                    let Ok(value) = serde_json::from_str::<serde_json::Value>(&raw) else {
                        continue;
                    };
                    let id_matches = value.get("id").and_then(|id| id.as_str()) == Some(version_id)
                        || dir.file_name().and_then(|name| name.to_str()) == Some(version_id);
                    if id_matches {
                        found = Some((dir, path));
                        break 'profiles;
                    }
                }
            }
        }
        found.ok_or_else(|| {
            format!(
                "Version JSON not found for installed profile '{version_id}' under {}",
                versions_root.display()
            )
        })?
    };

    let raw = std::fs::read_to_string(&json_path).map_err(|e| e.to_string())?;
    let mut child: serde_json::Value = serde_json::from_str(&raw).map_err(|e| e.to_string())?;

    if let Some(parent_id) = child
        .get("inheritsFrom")
        .and_then(|v| v.as_str())
        .map(String::from)
    {
        let (parent, _parent_dir) =
            load_effective_version_json_inner(mc_dir, &parent_id, visiting)?;

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
        if child
            .get("mainClass")
            .and_then(|v| v.as_str())
            .map(str::is_empty)
            .unwrap_or(true)
        {
            if let Some(p) = parent.get("mainClass") {
                child["mainClass"] = p.clone();
            }
        }
        if child.get("javaVersion").is_none() {
            if let Some(p) = parent.get("javaVersion") {
                child["javaVersion"] = p.clone();
            }
        }
    }

    visiting.remove(version_id);
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

fn quote_command_arg(arg: &str) -> String {
    if arg.chars().all(|c| {
        c.is_ascii_alphanumeric() || matches!(c, '/' | '\\' | ':' | '.' | '_' | '-' | '=' | '+')
    }) {
        arg.to_string()
    } else {
        format!("'{}'", arg.replace('\'', "'\\''"))
    }
}

fn redacted_command_args(args: &[String]) -> Vec<String> {
    let mut redact_next = false;
    args.iter()
        .map(|arg| {
            if redact_next {
                redact_next = false;
                return "<redacted>".to_string();
            }
            if arg == "--accessToken" {
                redact_next = true;
            }
            arg.clone()
        })
        .collect()
}

fn argument_rules_allow(value: &serde_json::Value) -> bool {
    let Some(rules) = value.get("rules").and_then(|rules| rules.as_array()) else {
        return true;
    };
    let mut allowed = false;
    for rule in rules {
        let matches_os = rule
            .get("os")
            .and_then(|os| os.get("name"))
            .and_then(|name| name.as_str())
            .map(|name| name == current_os_str())
            .unwrap_or(true);
        if matches_os {
            allowed = rule.get("action").and_then(|action| action.as_str()) == Some("allow");
        }
    }
    allowed
}

fn expand_metadata_argument(
    value: &serde_json::Value,
    replacements: &std::collections::HashMap<&str, String>,
) -> Vec<String> {
    if value.is_object() && !argument_rules_allow(value) {
        return Vec::new();
    }
    let raw = value.get("value").unwrap_or(value);
    let values = raw.as_array().cloned().unwrap_or_else(|| vec![raw.clone()]);
    values
        .into_iter()
        .filter_map(|value| {
            value.as_str().map(|argument| {
                let mut expanded = argument.to_string();
                for (key, replacement) in replacements {
                    expanded = expanded.replace(key, replacement);
                }
                expanded
            })
        })
        .collect()
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
            let matches =
                cls == current_classifier || (cfg!(target_os = "macos") && cls == "natives-osx");
            if matches {
                if let Some(p) = lib
                    .get("downloads")
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
    if let Some(cls) = lib
        .get("natives")
        .and_then(|n| n.get(key))
        .and_then(|c| c.as_str())
    {
        if let Some(p) = lib
            .get("downloads")
            .and_then(|d| d.get("classifiers"))
            .and_then(|c| c.get(cls))
            .and_then(|a| a.get("path"))
            .and_then(|p| p.as_str())
        {
            return Some(p.to_string());
        }
    }

    if let Some(name) = lib.get("name").and_then(|n| n.as_str()) {
        let classifier = name.split(':').nth(3)?;
        if let Some(p) = lib
            .get("downloads")
            .and_then(|d| d.get("classifiers"))
            .and_then(|c| c.get(classifier))
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
        let mut entry = archive
            .by_index(i)
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
        if let Some(fname) = std::path::Path::new(&name)
            .file_name()
            .and_then(|s| s.to_str())
        {
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
        let Some(rel) = native_library_path(lib) else {
            continue;
        };
        let jar = libs_root.join(&rel);
        if !jar.exists() {
            return Err(std::io::Error::new(
                std::io::ErrorKind::NotFound,
                format!("required native artifact is missing: {}", jar.display()),
            ));
        }
        extract_jar_natives(&jar, natives_dir, exts)?;
    }
    Ok(())
}

fn update_rpc_from_game_line(line: &str, version: &str) {
    if line.contains("Starting integrated server") || line.contains("Integrated server") {
        let _ = crate::richpresence::set_singleplayer_presence(version.to_string());
    } else if let Some((_, address)) = line.split_once("Connecting to ") {
        let server = address.split_whitespace().next().unwrap_or(address).trim_matches(',');
        if !server.is_empty() {
            let _ = crate::richpresence::set_multiplayer_presence(server.to_string());
        }
    }
}

fn apply_performance_profile(game_dir: &std::path::Path, profile: &str) -> Result<(), String> {
    let path = game_dir.join("options.txt");
    let raw = std::fs::read_to_string(&path).unwrap_or_default();
    let mut lines: Vec<String> = raw.lines().map(String::from).collect();
    let desired = match profile {
        "maximum" => [
            ("maxFps", "60"), ("enableVsync", "true"), ("renderDistance", "8"),
            ("simulationDistance", "5"), ("graphics", "fast"), ("clouds", "false"),
            ("particles", "decreased"), ("entityShadows", "false"), ("biomeBlendRadius", "0"),
        ],
        "balanced" => [
            ("maxFps", "120"), ("enableVsync", "true"), ("renderDistance", "12"),
            ("simulationDistance", "8"), ("graphics", "fabulous"), ("clouds", "true"),
            ("particles", "decreased"), ("entityShadows", "true"), ("biomeBlendRadius", "2"),
        ],
        _ => [
            ("maxFps", "200"), ("enableVsync", "false"), ("renderDistance", "16"),
            ("simulationDistance", "12"), ("graphics", "fabulous"), ("clouds", "true"),
            ("particles", "all"), ("entityShadows", "true"), ("biomeBlendRadius", "5"),
        ],
    };
    for (key, value) in desired {
        if let Some(line) = lines.iter_mut().find(|line| line.starts_with(&format!("{key}:"))) {
            *line = format!("{key}:{value}");
        } else {
            lines.push(format!("{key}:{value}"));
        }
    }
    let data = format!("{}\n", lines.join("\n"));
    if data != raw {
        atomic_write(&path, data.as_bytes())?;
    }
    Ok(())
}

async fn build_and_spawn(app: &AppHandle, settings: &Settings) -> Result<(), String> {
    let mc_dir = settings
        .mc_dir
        .clone()
        .map(PathBuf::from)
        .or_else(default_mc_dir)
        .ok_or_else(|| "Could not determine .minecraft directory.".to_string())?;

    let _ = std::fs::create_dir_all(&mc_dir);
    append_launcher_log(
        "info",
        "storage",
        &format!("Using launcher root: {}", mc_dir.display()),
    );

    let meta = if let Some(id) = &settings.instance_id {
        if !id.trim().is_empty() {
            crate::mods::read_metadata(&mc_dir, id)
        } else {
            None
        }
    } else {
        None
    };

    let effective_version = meta
        .as_ref()
        .map(|m| m.installed_version_id.clone())
        .unwrap_or_else(|| effective_version_id(settings));

    let (v, version_dir) = load_effective_version_json(&mc_dir, &effective_version)?;
    let minecraft_version = meta
        .as_ref()
        .map(|m| m.mc_version.as_str())
        .unwrap_or(settings.version.as_str());
    let required_java_major = get_required_java_major_from_metadata(minecraft_version, &v);
    let java = ensure_java_for_major(
        app.clone(),
        meta.as_ref()
            .and_then(|m| m.java_path.clone())
            .or_else(|| settings.java_path.clone()),
        required_java_major,
    )
    .await?;
    let java_major = crate::java::check_java_runtime(PathBuf::from(&java).as_path(), Some(minecraft_version))
        .map(|runtime| runtime.major_version)
        .unwrap_or(required_java_major);
    append_launcher_log(
        "info",
        "java",
        &format!(
            "Using Java {} for Minecraft {}: {}",
            required_java_major, minecraft_version, java
        ),
    );

    let parent_id = v
        .get("inheritsFrom")
        .and_then(|p| p.as_str())
        .map(String::from);
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

    let main_class = v
        .get("mainClass")
        .and_then(|m| m.as_str())
        .unwrap_or("net.minecraft.client.main.Main")
        .to_string();

    let asset_index = v
        .get("assetIndex")
        .and_then(|a| a.get("id"))
        .and_then(|i| i.as_str())
        .or_else(|| v.get("assets").and_then(|a| a.as_str()))
        .unwrap_or("legacy")
        .to_string();

    let libs_root = mc_dir.join("libraries");
    crate::install::ensure_version_libraries(app, &v, &mc_dir).await?;
    let mut classpath: Vec<PathBuf> = Vec::new();
    let mut missing_libraries: Vec<PathBuf> = Vec::new();
    let mut seen_library_paths: std::collections::HashSet<String> =
        std::collections::HashSet::new();
    if let Some(libs) = v.get("libraries").and_then(|l| l.as_array()) {
        for lib in libs {
            if !library_allowed(lib) {
                continue;
            }
            if native_library_path(lib).is_some() {
                continue;
            }

            let path = lib
                .get("downloads")
                .and_then(|d| d.get("artifact"))
                .and_then(|a| a.get("path"))
                .and_then(|p| p.as_str())
                .map(String::from)
                .or_else(|| {
                    lib.get("name")
                        .and_then(|n| n.as_str())
                        .map(maven_path_from_coord)
                });
            let Some(path) = path else { continue };

            if !seen_library_paths.insert(path.clone()) {
                continue;
            }
            let full = libs_root.join(&path);
            if full.exists() {
                classpath.push(full);
            } else {
                missing_libraries.push(full);
            }
            if path.ends_with("/lwjgl-3.4.1-unsafe.jar") {
                let core_path = path.replace("-unsafe.jar", ".jar");
                if seen_library_paths.insert(core_path.clone()) {
                    let core_full = libs_root.join(core_path);
                    if core_full.exists() {
                        classpath.push(core_full);
                    } else {
                        missing_libraries.push(core_full);
                    }
                }
            }
        }
    }
    if !missing_libraries.is_empty() {
        let list = missing_libraries
            .iter()
            .take(16)
            .map(|p| format!("  - {}", p.display()))
            .collect::<Vec<_>>()
            .join("\n");
        let extra = if missing_libraries.len() > 16 {
            format!("\n  ... and {} more", missing_libraries.len() - 16)
        } else {
            String::new()
        };
        return Err(format!(
            "Launch classpath is incomplete. Reinstall this version; missing libraries:\n{list}{extra}"
        ));
    }
    classpath.push(version_jar_path);
    let cp_sep = if cfg!(windows) { ";" } else { ":" };
    let cp_str = classpath
        .iter()
        .map(|p| p.to_string_lossy().to_string())
        .collect::<Vec<_>>()
        .join(cp_sep);

    let mut cmd = Command::new(&java);
    let mut launch_args: Vec<String> = Vec::new();
    let mut add_arg = |cmd: &mut Command, arg: String| {
        cmd.arg(&arg);
        launch_args.push(arg);
    };
    let configured_ram = meta
        .as_ref()
        .and_then(|m| m.memory_mb)
        .unwrap_or(settings.ram_mb)
        .max(512);
    let reserve_mb = match settings.performance_profile.as_str() {
        "maximum" => 3072,
        "quality" => 2048,
        _ => 4096,
    };
    let available_for_game = crate::settings::detect_hardware()
        .memory_mb
        .saturating_sub(reserve_mb) as u32;
    let ram = configured_ram.min(available_for_game.max(512));
    add_arg(&mut cmd, format!("-Xmx{}M", ram));
    add_arg(&mut cmd, "-Xms512M".to_string());

    let jvm_args = meta
        .as_ref()
        .and_then(|m| m.java_args.clone())
        .unwrap_or_else(|| settings.jvm_args.clone());
    let mut seen_jvm_args = std::collections::HashSet::new();
    for arg in jvm_args.split_whitespace().map(str::trim).filter(|arg| !arg.is_empty()) {
        if arg.starts_with("-Xmx")
            || arg.starts_with("-Xms")
            || arg == "--sun-misc-unsafe-memory-access=allow"
        {
            append_launcher_log("warn", "java", &format!("Ignoring unsupported JVM argument: {arg}"));
            continue;
        }
        if seen_jvm_args.insert(arg.to_string()) {
            add_arg(&mut cmd, arg.to_string());
        }
    }
    if java_major >= 17 && seen_jvm_args.insert("--enable-native-access=ALL-UNNAMED".to_string()) {
        add_arg(&mut cmd, "--enable-native-access=ALL-UNNAMED".to_string());
    }

    let natives_dir = version_dir.join("natives");
    let _ = std::fs::create_dir_all(&natives_dir);
    if let Some(libs) = v.get("libraries").and_then(|l| l.as_array()) {
        extract_natives(libs, &libs_root, &natives_dir)
            .map_err(|e| format!("Native dependency validation failed: {e}"))?;
    }
    if let Some(args_obj) = v.get("arguments").and_then(|a| a.as_object()) {
        if let Some(jvm_arr) = args_obj.get("jvm").and_then(|g| g.as_array()) {
            let mut jvm_replacements = std::collections::HashMap::new();
            jvm_replacements.insert(
                "${natives_directory}",
                natives_dir.to_string_lossy().to_string(),
            );
            jvm_replacements.insert("${launcher_name}", "aqua".to_string());
            jvm_replacements.insert("${launcher_version}", "1.0".to_string());
            jvm_replacements.insert("${classpath}", cp_str.clone());
            for arg_val in jvm_arr {
                for argument in expand_metadata_argument(arg_val, &jvm_replacements) {
                    if argument == "-cp" || argument == cp_str {
                        continue;
                    }
                    add_arg(&mut cmd, argument);
                }
            }
        }
    }

    add_arg(
        &mut cmd,
        format!("-Djava.library.path={}", natives_dir.display()),
    );
    add_arg(&mut cmd, format!("-Djna.tmpdir={}", natives_dir.display()));
    add_arg(
        &mut cmd,
        format!(
            "-Dorg.lwjgl.system.SharedLibraryExtractPath={}",
            natives_dir.display()
        ),
    );
    add_arg(
        &mut cmd,
        format!("-Dio.netty.native.workdir={}", natives_dir.display()),
    );

    add_arg(&mut cmd, "-cp".to_string());
    add_arg(&mut cmd, cp_str.clone());
    add_arg(&mut cmd, main_class.clone());

    let active = load_account_file(app);
    let (username, uuid, access_token, user_type) = match active {
        Some(acc) => (
            acc.username,
            acc.uuid,
            acc.mc_access_token,
            "msa".to_string(),
        ),
        None => {
            let u = if settings.username.trim().is_empty() {
                "AquaPlayer".to_string()
            } else {
                settings.username.clone()
            };
            let id = offline_uuid(&u);
            (u, id, "0".to_string(), "legacy".to_string())
        }
    };

    let game_profile_id = meta.as_ref().map(|m| m.id.clone()).unwrap_or_else(|| {
        settings
            .instance_id
            .as_deref()
            .filter(|id| !id.trim().is_empty())
            .unwrap_or(&effective_version)
            .to_string()
    });
    let game_dir = meta
        .as_ref()
        .and_then(|m| m.game_dir.clone())
        .map(PathBuf::from)
        .unwrap_or_else(|| instance_dir(&mc_dir, &game_profile_id));
    if let Err(error) = apply_performance_profile(&game_dir, &settings.performance_profile) {
        append_launcher_log("warn", "performance.profile", &format!("Unable to apply {} video profile: {error}", settings.performance_profile));
    }
    let _ = std::fs::create_dir_all(game_dir.join("mods"));
    let _ = std::fs::create_dir_all(game_dir.join("resourcepacks"));
    let _ = std::fs::create_dir_all(game_dir.join("shaderpacks"));

    let mut replacements = std::collections::HashMap::new();
    replacements.insert("${auth_player_name}", username);
    replacements.insert("${version_name}", effective_version.clone());
    replacements.insert("${game_directory}", game_dir.to_string_lossy().to_string());
    replacements.insert(
        "${assets_root}",
        mc_dir.join("assets").to_string_lossy().to_string(),
    );
    replacements.insert("${assets_index_name}", asset_index.clone());
    replacements.insert("${auth_uuid}", uuid);
    replacements.insert("${auth_access_token}", access_token);
    replacements.insert("${user_type}", user_type);
    replacements.insert("${version_type}", "release".to_string());
    replacements.insert("${user_properties}", "{}".to_string());

    let resolve_arg = |arg: &str, map: &std::collections::HashMap<&str, String>| -> String {
        let mut res = arg.to_string();
        for (k, v) in map {
            res = res.replace(k, v);
        }
        res
    };

    let mut game_args = Vec::new();
    if let Some(args_obj) = v.get("arguments").and_then(|a| a.as_object()) {
        if let Some(game_arr) = args_obj.get("game").and_then(|g| g.as_array()) {
            for arg_val in game_arr {
                game_args.extend(expand_metadata_argument(arg_val, &replacements));
            }
        }
    } else if let Some(minecraft_args) = v.get("minecraftArguments").and_then(|m| m.as_str()) {
        for part in minecraft_args.split_whitespace() {
            game_args.push(resolve_arg(part, &replacements));
        }
    }

    if game_args.is_empty() {
        // Fallback just in case
        game_args = vec![
            "--username".into(),
            replacements["${auth_player_name}"].clone(),
            "--version".into(),
            replacements["${version_name}"].clone(),
            "--gameDir".into(),
            replacements["${game_directory}"].clone(),
            "--assetsDir".into(),
            replacements["${assets_root}"].clone(),
            "--assetIndex".into(),
            replacements["${assets_index_name}"].clone(),
            "--uuid".into(),
            replacements["${auth_uuid}"].clone(),
            "--accessToken".into(),
            replacements["${auth_access_token}"].clone(),
            "--userType".into(),
            replacements["${user_type}"].clone(),
            "--versionType".into(),
            replacements["${version_type}"].clone(),
        ];
    }

    for arg in game_args {
        add_arg(&mut cmd, arg);
    }

    cmd.current_dir(&game_dir);
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }
    drop(add_arg);

    let command_line = std::iter::once(java.clone())
        .chain(redacted_command_args(&launch_args))
        .map(|arg| quote_command_arg(&arg))
        .collect::<Vec<_>>()
        .join(" ");
    let _ = app.emit(
        "launch-log",
        serde_json::json!({"stream": "stdout", "line": format!("[aqua] Java command: {command_line}")}),
    );
    append_launcher_log("info", "java", &format!("Java command: {command_line}"));
    let _ = app.emit(
        "launch-log",
        serde_json::json!({"stream": "stdout", "line": format!("[aqua] Classpath: {cp_str}")}),
    );
    append_launcher_log("info", "classpath", &format!("Classpath: {cp_str}"));
    append_launcher_log(
        "info",
        "launch.config",
        &format!(
            "java={} main_class={} version_metadata={} game_directory={} natives_directory={} libraries={} arguments={}",
            java,
            main_class,
            effective_version,
            game_dir.display(),
            natives_dir.display(),
            classpath.len(),
            launch_args.len()
        ),
    );

    let _ = app.emit(
        "launch-status",
        serde_json::json!({
            "phase": "starting",
            "message": "Spawning Java..."
        }),
    );

    let mut child = cmd.spawn().map_err(|e| {
        format!("Failed to start Java ({java}): {e}\nMake sure Java is installed and available, or set the Java path in Settings.")
    })?;
    if let Some(state) = app.try_state::<LaunchState>() {
        if let Ok(mut child_pid) = state.child_pid.lock() {
            *child_pid = Some(child.id());
        }
    }

    let _ = app.emit(
        "launch-status",
        serde_json::json!({
            "phase": "running",
            "message": "Minecraft running"
        }),
    );
    let _ = crate::richpresence::set_menu_presence(effective_version.clone());

    let recent_output = Arc::new(Mutex::new(VecDeque::<String>::with_capacity(24)));
    let last_log_emit = Arc::new(Mutex::new(Instant::now() - Duration::from_secs(1)));

    if let Some(out) = child.stdout.take() {
        let app2 = app.clone();
        let recent = Arc::clone(&recent_output);
        let last_emit = Arc::clone(&last_log_emit);
        let rpc_version = effective_version.clone();
        std::thread::spawn(move || {
            for line in BufReader::new(out).lines().map_while(Result::ok) {
                update_rpc_from_game_line(&line, &rpc_version);
                if let Ok(mut lines) = recent.lock() {
                    if lines.len() >= 24 {
                        lines.pop_front();
                    }
                    lines.push_back(format!("stdout: {line}"));
                }
                let should_emit = last_emit
                    .lock()
                    .map(|mut last| {
                        if last.elapsed() >= Duration::from_millis(100) {
                            *last = Instant::now();
                            true
                        } else {
                            false
                        }
                    })
                    .unwrap_or(true);
                if should_emit {
                    let _ = app2.emit(
                        "launch-log",
                        serde_json::json!({"stream": "stdout", "line": line}),
                    );
                }
                let lower = line.to_ascii_lowercase();
                if lower.contains("error") || lower.contains("exception") || lower.contains("crash") {
                    append_launcher_log("info", "minecraft.stdout", &line);
                }
            }
        });
    }
    if let Some(err) = child.stderr.take() {
        let app2 = app.clone();
        let recent = Arc::clone(&recent_output);
        let last_emit = Arc::clone(&last_log_emit);
        let rpc_version = effective_version.clone();
        std::thread::spawn(move || {
            for line in BufReader::new(err).lines().map_while(Result::ok) {
                update_rpc_from_game_line(&line, &rpc_version);
                if let Ok(mut lines) = recent.lock() {
                    if lines.len() >= 24 {
                        lines.pop_front();
                    }
                    lines.push_back(format!("stderr: {line}"));
                }
                let should_emit = last_emit
                    .lock()
                    .map(|mut last| {
                        if last.elapsed() >= Duration::from_millis(100) {
                            *last = Instant::now();
                            true
                        } else {
                            false
                        }
                    })
                    .unwrap_or(true);
                if should_emit {
                    let _ = app2.emit(
                        "launch-log",
                        serde_json::json!({"stream": "stderr", "line": line}),
                    );
                }
                let lower = line.to_ascii_lowercase();
                if lower.contains("error") || lower.contains("exception") || lower.contains("crash") {
                    append_launcher_log("error", "minecraft.stderr", &line);
                }
            }
        });
    }

    let app3 = app.clone();
    // capture handy context for the exit event
    let java_str = java.clone();
    let eff_ver = effective_version.clone();
    let loader_type = settings.loader_type.clone();
    let cwd = game_dir.clone();
    let recent = Arc::clone(&recent_output);

    std::thread::spawn(move || {
        let code = child.wait().ok().and_then(|s| s.code()).unwrap_or(-1);
        if let Some(state) = app3.try_state::<LaunchState>() {
            if let Ok(mut running) = state.running.lock() {
                *running = false;
            }
            if let Ok(mut child_pid) = state.child_pid.lock() {
                *child_pid = None;
            }
        }
        let _ = crate::richpresence::set_idle_presence(app3.clone());
        let recent_lines = recent
            .lock()
            .map(|lines| lines.iter().cloned().collect::<Vec<_>>())
            .unwrap_or_default();
        let user_closed = code == 130 || code == -1073741510;
        let error_hint = if code == 0 || user_closed {
            String::new()
        } else if recent_lines.is_empty() {
            "Minecraft closed without writing an error to stdout or stderr. Open logs for full launch context.".to_string()
        } else {
            recent_lines.join("\n")
        };
        let message = if code == 0 || user_closed {
            "Minecraft exited normally.".to_string()
        } else {
            format!("Minecraft exited with code {code}.\n{error_hint}")
        };
        append_launcher_log(
            if code == 0 { "info" } else { "error" },
            "launch.exit",
            &message,
        );
        let _ = app3.emit(
            "launch-status",
            serde_json::json!({
                "phase": "exited",
                "code": code,
                "message": message,
                "error": error_hint,
                "java": java_str,
                "version": eff_ver,
                "loader": loader_type,
                "cwd": cwd.to_string_lossy().to_string()
            }),
        );
    });

    Ok(())
}
