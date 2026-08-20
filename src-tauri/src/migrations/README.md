# SQLite migrations

Add each SQLite schema migration as a uniquely versioned Rust registration in
`src-tauri/src/migrations/mod.rs`. Run migrations transactionally through the
Tauri SQL plugin before repositories access persistent data.
