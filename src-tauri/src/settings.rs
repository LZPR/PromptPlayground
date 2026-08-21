use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedSettings {
    pub base_url: String,
    pub model: String,
    pub temperature: f64,
    pub max_output: u32,
    pub stream: bool,
    pub display_mode: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GlobalSettings {
    pub base_url: String,
    pub api_key_present: bool,
    pub model: String,
    pub temperature: f64,
    pub max_output: u32,
    pub stream: bool,
    pub display_mode: String,
}

impl Default for SavedSettings {
    fn default() -> Self {
        Self {
            base_url: String::new(),
            model: String::new(),
            temperature: 0.7,
            max_output: 1024,
            stream: true,
            display_mode: "markdown".to_string(),
        }
    }
}

pub struct SettingsStore {
    database_path: PathBuf,
}

impl SettingsStore {
    pub fn new(database_path: PathBuf) -> Result<Self, String> {
        if let Some(parent) = database_path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|error| format!("Unable to create settings directory: {error}"))?;
        }
        let store = Self { database_path };
        store.initialize()?;
        Ok(store)
    }

    pub fn load(&self, api_key_present: bool) -> Result<GlobalSettings, String> {
        let connection = self.open()?;
        let saved = connection
            .query_row(
                "SELECT base_url, model, temperature, max_output, stream, display_mode FROM global_settings WHERE singleton = 1",
                [],
                |row| Ok(SavedSettings {
                    base_url: row.get(0)?,
                    model: row.get(1)?,
                    temperature: row.get(2)?,
                    max_output: row.get(3)?,
                    stream: row.get::<_, i64>(4)? != 0,
                    display_mode: row.get(5)?,
                }),
            )
            .optional()
            .map_err(|error| format!("Unable to read settings: {error}"))?
            .unwrap_or_default();
        Ok(GlobalSettings { api_key_present, base_url: saved.base_url, model: saved.model, temperature: saved.temperature, max_output: saved.max_output, stream: saved.stream, display_mode: saved.display_mode })
    }

    pub fn save(&self, settings: &SavedSettings, api_key_present: bool) -> Result<GlobalSettings, String> {
        validate(settings)?;
        let connection = self.open()?;
        connection.execute(
            "INSERT INTO global_settings (singleton, base_url, model, temperature, max_output, stream, display_mode, updated_at)
             VALUES (1, ?1, ?2, ?3, ?4, ?5, ?6, datetime('now'))
             ON CONFLICT(singleton) DO UPDATE SET base_url = excluded.base_url, model = excluded.model,
                 temperature = excluded.temperature, max_output = excluded.max_output, stream = excluded.stream,
                 display_mode = excluded.display_mode, updated_at = excluded.updated_at",
            params![settings.base_url, settings.model, settings.temperature, settings.max_output, i64::from(settings.stream), settings.display_mode],
        ).map_err(|error| format!("Unable to save settings: {error}"))?;
        Ok(GlobalSettings { api_key_present, base_url: settings.base_url.clone(), model: settings.model.clone(), temperature: settings.temperature, max_output: settings.max_output, stream: settings.stream, display_mode: settings.display_mode.clone() })
    }

    fn initialize(&self) -> Result<(), String> {
        self.open()?.execute_batch(
            "CREATE TABLE IF NOT EXISTS global_settings (
                singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
                base_url TEXT NOT NULL, model TEXT NOT NULL, temperature REAL NOT NULL,
                max_output INTEGER NOT NULL, stream INTEGER NOT NULL CHECK (stream IN (0, 1)),
                display_mode TEXT NOT NULL CHECK (display_mode IN ('raw', 'markdown')),
                updated_at TEXT NOT NULL
            );",
        ).map_err(|error| format!("Unable to initialize settings: {error}"))?;
        Ok(())
    }

    fn open(&self) -> Result<Connection, String> {
        Connection::open(&self.database_path).map_err(|error| format!("Unable to open settings database: {error}"))
    }
}

fn validate(settings: &SavedSettings) -> Result<(), String> {
    if !(0.0..=2.0).contains(&settings.temperature) {
        return Err("Temperature must be between 0 and 2".to_string());
    }
    if settings.max_output == 0 {
        return Err("Maximum output must be greater than zero".to_string());
    }
    if settings.display_mode != "raw" && settings.display_mode != "markdown" {
        return Err("Display mode must be raw or markdown".to_string());
    }
    Ok(())
}
