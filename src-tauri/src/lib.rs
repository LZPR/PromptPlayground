mod commands;
mod migrations;
mod network;
mod repositories;
mod secret_store;
mod settings;

pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(migrations::SESSION_DATABASE_URL, migrations::migrations())
                .build(),
        )
        .setup(|app| {
            use tauri::Manager;
            let app_data_dir = app.path().app_config_dir()?;
            let database_path = app_data_dir.join("prompt-playground.db");
            let settings_store = settings::SettingsStore::new(database_path)
                .map_err(std::io::Error::other)?;
            let secret_store = secret_store::LocalSecretStore::new(app_data_dir.join("api-key"));
            app.manage(commands::AppState::new(settings_store, secret_store));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::health_check,
            commands::load_settings,
            commands::save_settings,
            commands::save_api_key,
            commands::clear_api_key,
            commands::start_generation,
            commands::cancel_generation
        ])
        .run(tauri::generate_context!())
        .expect("error while running Prompt Playground")
}
