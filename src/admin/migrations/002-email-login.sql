CREATE TABLE admin_email_challenges (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE, code_hash TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL);
CREATE INDEX email_challenges_user ON admin_email_challenges(user_id, created_at);
