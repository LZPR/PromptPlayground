/// API-key persistence is isolated so the prototype-local store can later be
/// replaced with platform credential storage without changing business logic.
pub trait SecretStore {
    fn read_api_key(&self) -> Result<Option<String>, String>;
    fn save_api_key(&self, value: &str) -> Result<(), String>;
    fn clear_api_key(&self) -> Result<(), String>;
}

pub struct LocalSecretStore {
    path: std::path::PathBuf,
}

impl LocalSecretStore {
    pub fn new(path: std::path::PathBuf) -> Self {
        Self { path }
    }
}

impl SecretStore for LocalSecretStore {
    fn read_api_key(&self) -> Result<Option<String>, String> {
        match std::fs::read_to_string(&self.path) {
            Ok(value) if value.is_empty() => Ok(None),
            Ok(value) => Ok(Some(value)),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(error) => Err(format!("Unable to read API key: {error}")),
        }
    }

    fn save_api_key(&self, value: &str) -> Result<(), String> {
        if let Some(parent) = self.path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|error| format!("Unable to create key storage: {error}"))?;
        }
        std::fs::write(&self.path, value)
            .map_err(|error| format!("Unable to save API key: {error}"))
    }

    fn clear_api_key(&self) -> Result<(), String> {
        match std::fs::remove_file(&self.path) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(format!("Unable to clear API key: {error}")),
        }
    }
}
