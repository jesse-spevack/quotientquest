CREATE TABLE players (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  code_lookup TEXT NOT NULL UNIQUE,
  code_box TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE devices (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  token_lookup TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  remember INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);

CREATE INDEX devices_by_player ON devices (player_id);

CREATE TABLE link_tokens (
  token_lookup TEXT PRIMARY KEY,
  short_code_lookup TEXT NOT NULL UNIQUE,
  player_id TEXT NOT NULL REFERENCES players (id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);
