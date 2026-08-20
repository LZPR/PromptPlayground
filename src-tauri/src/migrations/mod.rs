/// Migrations are registered here before the SQL plugin opens the application database.
/// Business tables are intentionally deferred until the domain model is implemented.
pub const MIGRATION_DIRECTORY: &str = "migrations";
