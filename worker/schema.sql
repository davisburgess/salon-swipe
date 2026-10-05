-- Picture Plane backend. Accounts are identified only by the SHA-256 of a random collection key.
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  created INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  seq INTEGER NOT NULL DEFAULT 0          -- per-account change counter used as the sync cursor
);

CREATE TABLE IF NOT EXISTS swipes (
  account TEXT NOT NULL,
  uid TEXT NOT NULL,
  t INTEGER NOT NULL,                     -- client timestamp; newest wins
  seq INTEGER NOT NULL,
  body TEXT NOT NULL,
  PRIMARY KEY (account, uid)
);
CREATE INDEX IF NOT EXISTS swipes_seq ON swipes (account, seq);

CREATE TABLE IF NOT EXISTS meta (
  account TEXT PRIMARY KEY,
  t INTEGER NOT NULL,
  body TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS usage (
  account TEXT NOT NULL,
  day TEXT NOT NULL,
  kind TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (account, day, kind)
);
