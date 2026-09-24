CREATE TABLE athlete_profiles (
  account_id TEXT PRIMARY KEY,
  profile_markdown TEXT NOT NULL,
  timezone TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;
