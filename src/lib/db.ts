import Database from "better-sqlite3";

export function openDb(dbPath: string): Database.Database {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS practice_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      unit_id TEXT NOT NULL,
      sentence_index INTEGER NOT NULL,
      score INTEGER NOT NULL,
      -- 星级是落库时的快照（审计用）；展示一律按 score + 当前阈值重算，
      -- 阈值校准后旧记录自动按新标准呈现（ADR-0001）
      stars INTEGER NOT NULL,
      -- 归属字段：MVP 单孩子恒为 NULL，公网化时启用（ADR-0002 的预留）
      owner TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_attempts_unit_sentence
      ON practice_attempts (unit_id, sentence_index);
  `);
  return db;
}

export type Db = Database.Database;
