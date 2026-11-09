-- Schema D1 del forum. Applicalo con:  npx wrangler d1 execute hsk-forum --remote --file=schema.sql
CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY, ts INTEGER NOT NULL, author TEXT NOT NULL, owner TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ok',            -- ok | pending (in attesa del moderatore)
  reason TEXT, score INTEGER NOT NULL DEFAULT 0, ncomments INTEGER NOT NULL DEFAULT 0, pinned INTEGER NOT NULL DEFAULT 0, admin INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS posts_status_ts ON posts(status, ts DESC);
CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY, post_id TEXT NOT NULL, ts INTEGER NOT NULL, author TEXT NOT NULL, owner TEXT NOT NULL, body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ok', reason TEXT, score INTEGER NOT NULL DEFAULT 0, admin INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS comments_post ON comments(post_id, status);
CREATE TABLE IF NOT EXISTS votes (voter TEXT NOT NULL, target TEXT NOT NULL, v INTEGER NOT NULL, PRIMARY KEY (voter, target));   -- voter = hash, mai il codice in chiaro
CREATE INDEX IF NOT EXISTS votes_target ON votes(target);
CREATE TABLE IF NOT EXISTS reports (owner TEXT NOT NULL, target TEXT NOT NULL, ts INTEGER NOT NULL, PRIMARY KEY (owner, target));
CREATE TABLE IF NOT EXISTS rl (k TEXT PRIMARY KEY, w INTEGER NOT NULL, n INTEGER NOT NULL);   -- limiti di frequenza (chiave = hash dell'indirizzo)
