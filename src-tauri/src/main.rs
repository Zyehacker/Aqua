#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod auth;
mod download_manager;
mod install;
mod java;
mod launch;
mod mod_browser;
mod mods;
mod portable;
mod richpresence;
mod settings;
mod update;

use std::sync::Mutex;

use crate::launch::LaunchState;
use crate::settings::{ensure_launcher_layout, get_settings, save_settings};
use tauri::{Manager, WindowEvent};

fn main() {
    // ensure directory layout exists early
    let _ = ensure_launcher_layout();
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            update::start_updater_check_loop(app.handle().clone());
            // Restore window size/position/maximized from persisted settings (best-effort)
            let handle = app.handle();
            let win_opt = app.get_webview_window("main");
            if let Some(win) = win_opt {
                // Read saved settings
                let s = get_settings(handle.clone());
                // Restore size if available
                if let (Some(w), Some(h)) = (s.window_width, s.window_height) {
                    if (400..=10000).contains(&w) && (300..=10000).contains(&h) {
                        let _ = win.set_size(tauri::Size::Logical(tauri::LogicalSize {
                            width: w as f64,
                            height: h as f64,
                        }));
                    }
                }
                // Restore position if available
                if let (Some(x), Some(y)) = (s.window_x, s.window_y) {
                    // Windows can persist the sentinel off-screen position used
                    // for minimized/hidden windows. Never restore that as the
                    // main window location.
                    if x > -10000 && y > -10000 {
                        let _ =
                            win.set_position(tauri::Position::Logical(tauri::LogicalPosition {
                                x: x as f64,
                                y: y as f64,
                            }));
                    }
                }
                // Restore maximized state
                if s.window_maximized.unwrap_or(false) {
                    let _ = win.maximize();
                }

                // Persist window state on resize/move/maximize/unmaximize (best-effort)
                let app_handle_for_events = handle.clone();
                win.on_window_event(move |event| {
                    match event {
                        WindowEvent::Resized(size) => {
                            // size may be LogicalSize or PhysicalSize; convert via to_physical if needed
                            let (w, h) = (size.width as u32, size.height as u32);
                            let mut s2 = get_settings(app_handle_for_events.clone());
                            s2.window_width = Some(w);
                            s2.window_height = Some(h);
                            if let Some(wc) = app_handle_for_events.get_webview_window("main") {
                                s2.window_maximized = Some(wc.is_maximized().unwrap_or(false));
                            }
                            let _ = save_settings(app_handle_for_events.clone(), s2);
                        }
                        WindowEvent::Moved(pos) => {
                            let (x, y) = (pos.x as i32, pos.y as i32);
                            let mut s2 = get_settings(app_handle_for_events.clone());
                            s2.window_x = Some(x);
                            s2.window_y = Some(y);
                            if let Some(wc) = app_handle_for_events.get_webview_window("main") {
                                s2.window_maximized = Some(wc.is_maximized().unwrap_or(false));
                            }
                            let _ = save_settings(app_handle_for_events.clone(), s2);
                        }
                        _ => {}
                    }
                });
            }
            Ok(())
        })
        .manage(LaunchState {
            running: Mutex::new(false),
            child_pid: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            settings::get_settings,
            settings::save_settings,
            settings::get_default_mc_dir,
            settings::list_versions,
            settings::generate_optimal_args,
            settings::detect_hardware,
            settings::read_logs,
            java::ensure_java,
            java::list_java_runtimes,
            launch::launch_minecraft,
            launch::is_running,
            launch::stop_minecraft,
            auth::msa_login,
            auth::msa_logout,
            auth::get_account_textures,
            auth::get_account,
            install::list_remote_versions,
            install::list_fabric_loaders,
            install::list_forge_loaders,
            install::install_version,
            richpresence::start_rich_presence,
            richpresence::stop_rich_presence,
            richpresence::set_idle_presence,
            richpresence::set_singleplayer_presence,
            richpresence::set_multiplayer_presence,
            mods::list_instances,
            mods::storage_integrity_check,
            mods::validate_instance,
            mods::repair_instance,
            mods::get_instance,
            mods::list_mods,
            mods::create_instance,
            mods::update_instance,
            mods::duplicate_instance,
            mods::delete_instance,
            mods::open_instance_folder,
            mods::mark_instance_played,
            mods::add_mod,
            mods::delete_mod,
            mods::toggle_mod,
            mods::open_mods_folder,
            mod_browser::search_modrinth,
            mod_browser::install_modrinth_project,
            mod_browser::list_instance_items,
            mod_browser::remove_instance_item,
            mod_browser::is_version_installed,
            mods::rename_instance,
            mods::save_instance_icon,
            mods::read_instance_icon,
            portable::export_instance,
            portable::import_instance,
            download_manager::add_download,
            download_manager::pause_download,
            download_manager::resume_download,
            download_manager::cancel_download,
            download_manager::list_downloads,
            update::check_for_update,
            update::install_update,
            update::restart_app,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Aqua Client");
}
