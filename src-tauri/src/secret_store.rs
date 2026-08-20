/// API-key persistence is isolated so the prototype-local store can later be
/// replaced with platform credential storage without changing business logic.
pub trait SecretStore {
    fn read_api_key(&self) -> Result<Option<String>, String>;
    fn save_api_key(&self, value: &str) -> Result<(), String>;
    fn clear_api_key(&self) -> Result<(), String>;
}
