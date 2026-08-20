mod commands;
mod migrations;
mod network;
mod repositories;
mod secret_store;

pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(migrations::SESSION_DATABASE_URL, migrations::migrations())
                .build(),
        )
        .invoke_handler(tauri::generate_handler![commands::health_check])
        .run(tauri::generate_context!())
        .expect("error while running Prompt Playground")
}
