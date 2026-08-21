use crate::network::{run_generation, ChatMessage, GenerationRequest};
use crate::secret_store::{LocalSecretStore, SecretStore};
use crate::settings::{GlobalSettings, SavedSettings, SettingsStore};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

pub struct AppState {
    pub settings: SettingsStore,
    pub secret_store: Mutex<LocalSecretStore>,
    requests: Arc<Mutex<HashMap<String, ActiveRequest>>>,
}

struct ActiveRequest {
    session_id: String,
    message_id: String,
    handle: tauri::async_runtime::JoinHandle<()>,
}

impl AppState {
    pub fn new(settings: SettingsStore, secret_store: LocalSecretStore) -> Self {
        Self {
            settings,
            secret_store: Mutex::new(secret_store),
            requests: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartGenerationRequest {
    pub session_id: String,
    pub message_id: String,
    pub messages: Vec<ChatMessage>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartGenerationResponse {
    request_id: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CancelledEvent {
    request_id: String,
    session_id: String,
    message_id: String,
}

#[tauri::command]
pub fn health_check() -> &'static str {
    "ok"
}

#[tauri::command]
pub fn load_settings(state: State<'_, AppState>) -> Result<GlobalSettings, String> {
    let key_present = state.secret_store.lock().map_err(|_| "API key storage is unavailable".to_string())?.read_api_key()?.is_some();
    state.settings.load(key_present)
}

#[tauri::command]
pub fn save_settings(settings: SavedSettings, state: State<'_, AppState>) -> Result<GlobalSettings, String> {
    let key_present = state.secret_store.lock().map_err(|_| "API key storage is unavailable".to_string())?.read_api_key()?.is_some();
    state.settings.save(&settings, key_present)
}

#[tauri::command]
pub fn save_api_key(value: String, state: State<'_, AppState>) -> Result<GlobalSettings, String> {
    if value.trim().is_empty() {
        return Err("API key cannot be empty".to_string());
    }
    state.secret_store.lock().map_err(|_| "API key storage is unavailable".to_string())?.save_api_key(&value)?;
    state.settings.load(true)
}

#[tauri::command]
pub fn clear_api_key(state: State<'_, AppState>) -> Result<GlobalSettings, String> {
    state.secret_store.lock().map_err(|_| "API key storage is unavailable".to_string())?.clear_api_key()?;
    state.settings.load(false)
}

#[tauri::command]
pub fn start_generation(app: AppHandle, request: StartGenerationRequest, state: State<'_, AppState>) -> Result<StartGenerationResponse, String> {
    if request.messages.is_empty() {
        return Err("No request messages were supplied".to_string());
    }
    let api_key = state.secret_store.lock().map_err(|_| "API key storage is unavailable".to_string())?.read_api_key()?.ok_or_else(|| "API key is missing".to_string())?;
    let settings = state.settings.load(true)?;
    if settings.base_url.trim().is_empty() || settings.model.trim().is_empty() {
        return Err("Base URL and model must be configured before generation".to_string());
    }
    let request_id = Uuid::new_v4().to_string();
    let task_request = GenerationRequest { request_id: request_id.clone(), session_id: request.session_id.clone(), message_id: request.message_id.clone(), messages: request.messages, settings, api_key };
    let requests = Arc::clone(&state.requests);
    let cleanup_id = request_id.clone();
    let handle = tauri::async_runtime::spawn(async move {
        run_generation(app, task_request).await;
        if let Ok(mut active) = requests.lock() {
            active.remove(&cleanup_id);
        }
    });
    state.requests.lock().map_err(|_| "Generation state is unavailable".to_string())?.insert(request_id.clone(), ActiveRequest { session_id: request.session_id, message_id: request.message_id, handle });
    Ok(StartGenerationResponse { request_id })
}

#[tauri::command]
pub fn cancel_generation(app: AppHandle, request_id: String, state: State<'_, AppState>) -> Result<(), String> {
    let active = state.requests.lock().map_err(|_| "Generation state is unavailable".to_string())?.remove(&request_id).ok_or_else(|| "Generation request does not exist".to_string())?;
    active.handle.abort();
    app.emit("generation:cancelled", CancelledEvent { request_id, session_id: active.session_id, message_id: active.message_id })
        .map_err(|error| format!("Unable to emit cancellation: {error}"))
}

#[cfg(test)]
mod tests {
    use super::health_check;

    #[test]
    fn health_check_returns_ok() {
        assert_eq!(health_check(), "ok");
    }
}
