#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod auth;
mod install;
mod launch;
mod mods;
mod settings;
mod java;
mod mod_browser;

use std::sync::Mutex;

use crate::launch::LaunchState;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(LaunchState {
            running: Mutex::new(false),
        })
        .invoke_handler(tauri::generate_handler![
            settings::get_settings,
            settings::save_settings,
            settings::get_default_mc_dir,
            settings::list_versions,
            settings::generate_optimal_args,
            launch::launch_minecraft,
            launch::is_running,
            auth::msa_login,
            auth::msa_logout,
            auth::get_account,
            install::list_remote_versions,
            install::list_fabric_loaders,
            install::install_version,
            mods::list_instances,
            mods::list_mods,
            mods::add_mod,
            mods::delete_mod,
            mods::toggle_mod,
            mods::open_mods_folder,
            mod_browser::search_modrinth,
            mod_browser::install_modrinth_project,
            mod_browser::list_instance_items,
            mod_browser::remove_instance_item,
            mod_browser::is_version_installed,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Aqua Client");
}
