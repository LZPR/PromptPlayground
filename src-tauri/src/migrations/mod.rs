use tauri_plugin_sql::{Migration, MigrationKind};

pub const SESSION_DATABASE_URL: &str = "sqlite:prompt-playground.db";

pub fn migrations() -> Vec<Migration> {
    vec![Migration {
        version: 1,
        description: "create_session_foundation",
        kind: MigrationKind::Up,
        sql: r#"
            CREATE TABLE sessions (
                id TEXT PRIMARY KEY NOT NULL,
                title TEXT NOT NULL,
                title_initialized INTEGER NOT NULL CHECK (title_initialized IN (0, 1)),
                root_id TEXT NOT NULL,
                current_leaf_id TEXT,
                current_empty_branch_id TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE session_nodes (
                id TEXT PRIMARY KEY NOT NULL,
                session_id TEXT NOT NULL,
                parent_id TEXT,
                node_type TEXT NOT NULL CHECK (node_type IN ('root', 'message')),
                role TEXT CHECK (role IN ('system', 'user', 'assistant') OR role IS NULL),
                text TEXT,
                status TEXT CHECK (
                    status IN ('normal', 'pending_deletion', 'generating', 'failed', 'cancelled')
                    OR status IS NULL
                ),
                created_order INTEGER,
                branch_order INTEGER,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                UNIQUE (session_id, id),
                UNIQUE (session_id, created_order),
                FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
                FOREIGN KEY (session_id, parent_id)
                    REFERENCES session_nodes(session_id, id) ON DELETE RESTRICT,
                CHECK (
                    (node_type = 'root'
                        AND parent_id IS NULL
                        AND role IS NULL
                        AND text IS NULL
                        AND status IS NULL
                        AND created_order IS NULL
                        AND branch_order IS NULL)
                    OR
                    (node_type = 'message'
                        AND parent_id IS NOT NULL
                        AND role IS NOT NULL
                        AND text IS NOT NULL
                        AND status IS NOT NULL
                        AND created_order IS NOT NULL
                        AND branch_order IS NOT NULL)
                )
            );

            CREATE UNIQUE INDEX session_nodes_one_root_per_session
                ON session_nodes(session_id)
                WHERE node_type = 'root';
            CREATE INDEX session_nodes_by_parent
                ON session_nodes(session_id, parent_id, branch_order);

            CREATE TABLE empty_branches (
                id TEXT PRIMARY KEY NOT NULL,
                session_id TEXT NOT NULL,
                anchor_id TEXT NOT NULL,
                branch_order INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                UNIQUE (session_id, id),
                UNIQUE (session_id, anchor_id, branch_order),
                FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
                FOREIGN KEY (session_id, anchor_id)
                    REFERENCES session_nodes(session_id, id) ON DELETE CASCADE
            );
            CREATE INDEX empty_branches_by_anchor
                ON empty_branches(session_id, anchor_id, branch_order);
        "#,
    }]
}

#[cfg(test)]
mod tests {
    use super::migrations;

    #[test]
    fn registers_the_session_foundation_migration() {
        let migrations = migrations();

        assert_eq!(migrations.len(), 1);
        assert_eq!(migrations[0].version, 1);
        assert!(migrations[0].sql.contains("CREATE TABLE sessions"));
        assert!(migrations[0].sql.contains("current_empty_branch_id"));
        assert!(migrations[0].sql.contains("branch_order"));
        assert!(migrations[0].sql.contains("CREATE TABLE empty_branches"));
        assert!(migrations[0].sql.contains("ON DELETE CASCADE"));
    }
}
