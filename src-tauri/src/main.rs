#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod auth;
mod install;
mod launch;
mod mods;
mod download_manager;
mod settings;
mod java;
mod mod_browser;
mod update;
mod richpresence;

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
        .setup(|app| {
            update::start_updater_and_network_tracker(app.handle().clone());
            // Restore window size/position/maximized from persisted settings (best-effort)
            let handle = app.handle();
            let win_opt = app.get_webview_window("main");
            if let Some(win) = win_opt {
                // Read saved settings
                let s = get_settings(handle.clone());
                // Restore size if available
                if let (Some(w), Some(h)) = (s.window_width, s.window_height) {
                    let _ = win.set_size(tauri::Size::Logical(tauri::LogicalSize { width: w as f64, height: h as f64 }));
                }
                // Restore position if available
                if let (Some(x), Some(y)) = (s.window_x, s.window_y) {
                    let _ = win.set_position(tauri::Position::Logical(tauri::LogicalPosition { x: x as f64, y: y as f64 }));
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
        })
        .invoke_handler(tauri::generate_handler![
            settings::get_settings,
            settings::save_settings,
            settings::get_default_mc_dir,
            settings::list_versions,
            settings::generate_optimal_args,
            java::ensure_java,
            launch::launch_minecraft,
            launch::is_running,
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
            download_manager::add_download,
            download_manager::pause_download,
            download_manager::resume_download,
            download_manager::cancel_download,
            download_manager::list_downloads,
            update::download_update,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Aqua Client");
}
