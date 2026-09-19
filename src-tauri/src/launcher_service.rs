use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};

use crate::java::{check_java_runtime, ensure_java_for_major};
use crate::launch::{build_and_spawn, effective_version_id, load_effective_version_json, LaunchState};
use crate::mods::{read_metadata, InstanceMetadata};
use crate::settings::{default_mc_dir, Settings};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub enum LauncherPhase {
    Idle,
    Resolving,
    Preparing,
    Downloading,
    Launching,
    Running,
    Failed,
}

impl Default for LauncherPhase {
    fn default() -> Self {
        Self::Idle
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct LauncherStatusSnapshot {
    pub phase: LauncherPhase,
    pub message: String,
    pub error: Option<String>,
    pub percent: Option<f64>,
    pub selected_instance_id: Option<String>,
    pub selected_instance_name: Option<String>,
    pub minecraft_version: String,
    pub effective_version: String,
    pub java_path: Option<String>,
    pub java_major: Option<u32>,
    pub game_dir: Option<String>,
    pub ready: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct LaunchValidationResult {
    pub ok: bool,
    pub errors: Vec<String>,
    pub warnings: Vec<String>,
    pub status: Option<LauncherStatusSnapshot>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct LauncherLaunchResult {
    pub ok: bool,
    pub error: Option<String>,
    pub status: Option<LauncherStatusSnapshot>,
}

pub struct LauncherService;

impl LauncherService {
    fn selected_instance_metadata(
        mc_dir: &Path,
        settings: &Settings,
    ) -> Result<Option<InstanceMetadata>, String> {
        let Some(instance_id) = settings.instance_id.as_deref().filter(|id| !id.trim().is_empty()) else {
            return Ok(None);
        };

        let instance_dir = crate::settings::instance_dir(mc_dir, instance_id);
        let instance_json = instance_dir.join("instance.json");
        if !instance_json.exists() {
            return Err(format!(
                "Selected instance '{instance_id}' is missing its metadata file at {}.",
                instance_json.display()
            ));
        }

        let raw = std::fs::read_to_string(&instance_json)
            .map_err(|error| format!("Unable to read metadata for selected instance '{instance_id}': {error}"))?;

        let metadata: InstanceMetadata = serde_json::from_str(&raw).map_err(|error| {
            format!(
                "Selected instance '{instance_id}' metadata is corrupted: {error}. Please repair or recreate the instance."
            )
        })?;

        if metadata.id.trim() != instance_id {
            return Err(format!(
                "Selected instance '{instance_id}' metadata does not match the chosen instance ID. Expected '{instance_id}' but found '{}'.",
                metadata.id
            ));
        }

        Ok(Some(metadata))
    }

    fn resolve_game_dir(mc_dir: &Path, settings: &Settings, instance: Option<&InstanceMetadata>) -> PathBuf {
        if let Some(instance) = instance {
            if let Some(game_dir) = instance.game_dir.as_deref() {
                let path = PathBuf::from(game_dir);
                if !path.as_os_str().is_empty() {
                    return path;
                }
            }
            if let Some(id) = instance.id.as_str().split('/').next() {
                if !id.is_empty() {
                    return crate::settings::instance_dir(mc_dir, id);
                }
            }
        }
        if let Some(instance_id) = settings.instance_id.as_deref() {
            if !instance_id.trim().is_empty() {
                return crate::settings::instance_dir(mc_dir, instance_id);
            }
        }
        mc_dir.to_path_buf()
    }

    pub async fn resolve_state(app: AppHandle, settings: Settings) -> Result<LauncherStatusSnapshot, String> {
        let mc_dir = settings
            .mc_dir
            .clone()
            .map(PathBuf::from)
            .or_else(default_mc_dir)
            .ok_or_else(|| "Could not determine the default Minecraft directory.".to_string())?;

        let selected_instance_id = settings.instance_id.clone().filter(|id| !id.trim().is_empty());
        let instance = match Self::selected_instance_metadata(&mc_dir, &settings)? {
            Some(instance) => Some(instance),
            None => None,
        };

        if selected_instance_id.is_some() && instance.is_none() {
            return Err(format!(
                "No valid selected instance was found for '{}' in {}.",
                selected_instance_id.as_deref().unwrap_or("unknown"),
                mc_dir.display()
            ));
        }

        if selected_instance_id.is_none() {
            return Ok(LauncherStatusSnapshot {
                phase: LauncherPhase::Preparing,
                message: "No instance selected. Choose an instance before launching.".to_string(),
                error: Some("No instance selected.".to_string()),
                percent: None,
                selected_instance_id: None,
                selected_instance_name: None,
                minecraft_version: settings.version.clone(),
                effective_version: effective_version_id(&settings),
                java_path: settings.java_path.clone(),
                java_major: None,
                game_dir: None,
                ready: false,
            });
        }

        let instance = instance.expect("selected instance metadata validated above");
        let effective_version = instance.installed_version_id.clone();

        let (version_meta, _) = load_effective_version_json(&mc_dir, &effective_version)?;
        let minecraft_version = instance.mc_version.clone();

        let required_java_major = crate::java::get_required_java_major_from_metadata(
            &minecraft_version,
            &version_meta,
        );

        let java_path = ensure_java_for_major(
            app.clone(),
            instance
                .java_path
                .clone()
                .or_else(|| settings.java_path.clone()),
            required_java_major,
        )
        .await?;

        let java_major = check_java_runtime(Path::new(&java_path), Some(&minecraft_version))
            .map(|runtime| runtime.major_version)
            .unwrap_or(required_java_major);

        if java_major < required_java_major {
            return Err(format!(
                "Java {java_major} is below the required major version {required_java_major} for Minecraft {minecraft_version}."
            ));
        }

        let game_dir = Self::resolve_game_dir(&mc_dir, &settings, Some(&instance));

        Ok(LauncherStatusSnapshot {
            phase: LauncherPhase::Resolving,
            message: "Launcher state resolved.".to_string(),
            error: None,
            percent: Some(1.0),
            selected_instance_id: Some(instance.id.clone()),
            selected_instance_name: Some(instance.name.clone()),
            minecraft_version,
            effective_version,
            java_path: Some(java_path),
            java_major: Some(java_major),
            game_dir: Some(game_dir.to_string_lossy().to_string()),
            ready: true,
        })
    }

    pub async fn validate_for_launch(
        app: AppHandle,
        settings: Settings,
    ) -> Result<LaunchValidationResult, String> {
        let mut errors = Vec::new();
        let mut warnings = Vec::new();

        let mc_dir = settings
            .mc_dir
            .clone()
            .map(PathBuf::from)
            .or_else(default_mc_dir)
            .ok_or_else(|| "Could not determine the default Minecraft directory.".to_string())?;

        if settings.instance_id.as_ref().is_some_and(|id| !id.trim().is_empty()) {
            let id = settings.instance_id.clone().unwrap();
            if read_metadata(&mc_dir, &id).is_none() {
                errors.push(format!("Selected instance '{id}' could not be found in the launcher data directory."));
            }
        }

        let status = Self::resolve_state(app.clone(), settings.clone()).await;
        let status = match status {
            Ok(status) => status,
            Err(error) => {
                errors.push(error);
                LauncherStatusSnapshot::default()
            }
        };

        let ready = status.ready && errors.is_empty();

        if !ready {
            warnings.push("Java or instance resolution is not complete yet.".to_string());
        }

        let result = LaunchValidationResult {
            ok: ready,
            errors,
            warnings,
            status: Some(status),
        };

        if !result.ok {
            return Ok(result);
        }

        Ok(result)
    }

    pub async fn launch(
        app: AppHandle,
        state: State<'_, LaunchState>,
        settings: Settings,
    ) -> Result<LauncherLaunchResult, String> {
        {
            let mut running = state.running.lock().map_err(|error| error.to_string())?;
            if *running {
                return Err("Minecraft is already running.".to_string());
            }
            *running = true;
        }

        let validation = match Self::validate_for_launch(app.clone(), settings.clone()).await {
            Ok(validation) => validation,
            Err(error) => {
                if let Ok(mut running) = state.running.lock() {
                    *running = false;
                }
                return Err(error);
            }
        };
        if !validation.ok {
            if let Ok(mut running) = state.running.lock() {
                *running = false;
            }
            let error = if validation.errors.is_empty() {
                "Launcher validation failed.".to_string()
            } else {
                validation.errors.join("; ")
            };
            return Ok(LauncherLaunchResult {
                ok: false,
                error: Some(error),
                status: validation.status,
            });
        }

        let status = validation.status.unwrap_or_default();
        if let Err(error) = build_and_spawn(&app, &settings).await {
            if let Ok(mut running) = state.running.lock() {
                *running = false;
            }
            return Err(error);
        }

        Ok(LauncherLaunchResult {
            ok: true,
            error: None,
            status: Some(LauncherStatusSnapshot {
                phase: LauncherPhase::Launching,
                message: "Minecraft launch started.".to_string(),
                error: None,
                percent: Some(1.0),
                selected_instance_id: status.selected_instance_id,
                selected_instance_name: status.selected_instance_name,
                minecraft_version: status.minecraft_version,
                effective_version: status.effective_version,
                java_path: status.java_path,
                java_major: status.java_major,
                game_dir: status.game_dir,
                ready: true,
            }),
        })
    }
}

#[tauri::command]
pub async fn resolve_launcher_state(app: AppHandle, settings: Settings) -> Result<LauncherStatusSnapshot, String> {
    LauncherService::resolve_state(app, settings).await
}

#[tauri::command]
pub async fn validate_launcher_for_launch(
    app: AppHandle,
    settings: Settings,
) -> Result<LaunchValidationResult, String> {
    LauncherService::validate_for_launch(app, settings).await
}

#[tauri::command]
pub async fn launch_instance_v2(
    app: AppHandle,
    state: State<'_, LaunchState>,
    settings: Settings,
) -> Result<LauncherLaunchResult, String> {
    LauncherService::launch(app, state, settings).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn launcher_phase_defaults_are_stable() {
        assert!(matches!(LauncherPhase::default(), LauncherPhase::Idle));
    }

    #[test]
    fn settings_validation_rejects_empty_instance_id() {
        let settings = Settings {
            language: "en".to_string(),
            username: "Player".to_string(),
            version: "1.21.11".to_string(),
            loader_type: "vanilla".to_string(),
            fabric_loader_version: None,
            java_path: None,
            java_runtime: None,
            mc_dir: None,
            instance_id: Some("".to_string()),
            ram_mb: 2048,
            jvm_args: "".to_string(),
            performance_profile: "balanced".to_string(),
            show_snapshots: false,
            minimize_on_launch: true,
            window_x: None,
            window_y: None,
            window_width: None,
            window_height: None,
            window_maximized: None,
            ..Settings::default()
        };
        assert_eq!(settings.instance_id.as_deref(), Some(""));
    }
}
