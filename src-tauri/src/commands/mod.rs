#[tauri::command]
pub fn health_check() -> &'static str {
    "ok"
}

#[cfg(test)]
mod tests {
    use super::health_check;

    #[test]
    fn health_check_returns_ok() {
        assert_eq!(health_check(), "ok");
    }
}
