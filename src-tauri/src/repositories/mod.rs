/// Repository boundaries prevent components and stores from issuing SQL directly.
/// Implementations are added alongside the session and message domain models.
pub trait SessionRepository {}
pub trait MessageRepository {}
pub trait SettingsRepository {}
