import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { openDb, type Db } from "./db";

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const fn of cleanups) fn();
  cleanups.length = 0;
  delete process.env.DB_PATH;
});

function makeDbDir(prefix: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function columnNames(db: Db, table: string): string[] {
  return (
    db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  ).map((r) => r.name);
}

/** 12 号票之前的旧库：content_drafts 没有 unit_id/module_kind 两列 */
function createLegacyDraftsTable(dbPath: string): void {
  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE accounts (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      is_admin INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS content_drafts (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(id),
      title TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'custom',
      status TEXT NOT NULL DEFAULT 'transcribing'
        CHECK (status IN ('transcribing', 'proofreading', 'published')),
      video_path TEXT NOT NULL,
      transcribe_task_id TEXT,
      transcribe_error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  db.prepare(
    `INSERT INTO accounts (id, email, password_hash) VALUES ('acc-1', 'legacy@test.com', 'x')`
  ).run();
  db.prepare(
    `INSERT INTO content_drafts (id, account_id, title, video_path)
     VALUES ('legacy-1', 'acc-1', '旧草稿', 'acc-1/v.mp4')`
  ).run();
  db.close();
}

describe("openDb 的 content_drafts 迁移（12 号票）", () => {
  it("旧库补齐 unit_id/module_kind 两列，旧数据原样保留且可继续写入", () => {
    const p = path.join(makeDbDir("ra-migrate-"), "readalong.db");
    createLegacyDraftsTable(p);

    const db = openDb(p);
    try {
      const cols = columnNames(db, "content_drafts");
      expect(cols).toContain("unit_id");
      expect(cols).toContain("module_kind");

      // 旧行保留，新列取 NULL
      const legacy = db
        .prepare("SELECT * FROM content_drafts WHERE id = 'legacy-1'")
        .get() as { title: string; unit_id: string | null; module_kind: string | null };
      expect(legacy.title).toBe("旧草稿");
      expect(legacy.unit_id).toBeNull();
      expect(legacy.module_kind).toBeNull();

      // 补列后新行可带 unit/module
      db.prepare(
        `INSERT INTO content_drafts (id, account_id, title, video_path, type, unit_id, module_kind)
         VALUES ('std-1', 'acc-1', '标准草稿', 'acc-1/v.mp4', 'standard', '五上-U2', 'Story time')`
      ).run();
      const std = db
        .prepare("SELECT type, unit_id, module_kind FROM content_drafts WHERE id = 'std-1'")
        .get();
      expect(std).toEqual({
        type: "standard",
        unit_id: "五上-U2",
        module_kind: "Story time",
      });
    } finally {
      db.close();
    }
  });

  it("新库直接建出两列，重复 openDb 幂等不报错", () => {
    const p = path.join(makeDbDir("ra-fresh-"), "readalong.db");
    const db = openDb(p);
    expect(columnNames(db, "content_drafts")).toContain("unit_id");
    expect(columnNames(db, "content_drafts")).toContain("module_kind");
    db.close();

    const again = openDb(p);
    expect(columnNames(again, "content_drafts")).toContain("unit_id");
    expect(columnNames(again, "content_drafts")).toContain("module_kind");
    again.close();
  });
});

describe("openDb 的 practice_attempts 迁移（V0.3 run_id，票 04）", () => {
  /** V0.2 库：practice_attempts 已有 owner、还没有 run_id */
  function createV02AttemptsTable(dbPath: string): void {
    const db = new Database(dbPath);
    db.exec(`
      CREATE TABLE practice_attempts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        unit_id TEXT NOT NULL,
        sentence_index INTEGER NOT NULL,
        score INTEGER NOT NULL,
        stars INTEGER NOT NULL,
        owner TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    db.prepare(
      `INSERT INTO practice_attempts (unit_id, sentence_index, score, stars, owner)
       VALUES ('u2-dragon-dance', 0, 92, 3, 'acc-1')`
    ).run();
    db.close();
  }

  it("旧库补 run_id 列，旧记录保留且 run_id 为 NULL", () => {
    const p = path.join(makeDbDir("ra-migrate-run-"), "readalong.db");
    createV02AttemptsTable(p);

    const db = openDb(p);
    try {
      expect(columnNames(db, "practice_attempts")).toContain("run_id");
      const row = db
        .prepare("SELECT unit_id, score, owner, run_id FROM practice_attempts")
        .get() as {
        unit_id: string;
        score: number;
        owner: string;
        run_id: string | null;
      };
      expect(row).toEqual({
        unit_id: "u2-dragon-dance",
        score: 92,
        owner: "acc-1",
        run_id: null,
      });

      // 补列后新行可带 run_id
      db.prepare(
        `INSERT INTO practice_attempts (unit_id, sentence_index, score, stars, owner, run_id)
         VALUES ('u2-dragon-dance', 1, 88, 2, 'acc-1', 'run-1')`
      ).run();
      const inserted = db
        .prepare("SELECT run_id FROM practice_attempts WHERE sentence_index = 1")
        .get() as { run_id: string };
      expect(inserted.run_id).toBe("run-1");
    } finally {
      db.close();
    }
  });

  it("新库直接建出 run_id，重复 openDb 幂等不报错", () => {
    const p = path.join(makeDbDir("ra-fresh-run-"), "readalong.db");
    const db = openDb(p);
    expect(columnNames(db, "practice_attempts")).toContain("run_id");
    db.close();

    const again = openDb(p);
    expect(columnNames(again, "practice_attempts")).toContain("run_id");
    again.close();
  });
});

describe("openDb 的 practice_attempts 迁移（V0.2 owner）", () => {
  /** V0.1 早期库：practice_attempts 没有 owner 列 */
  function createLegacyAttemptsTable(dbPath: string): void {
    const db = new Database(dbPath);
    db.exec(`
      CREATE TABLE practice_attempts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        unit_id TEXT NOT NULL,
        sentence_index INTEGER NOT NULL,
        score INTEGER NOT NULL,
        stars INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    db.prepare(
      `INSERT INTO practice_attempts (unit_id, sentence_index, score, stars)
       VALUES ('u2-dragon-dance', 0, 92, 3)`
    ).run();
    db.close();
  }

  it("旧库补 owner 列，旧记录保留且 owner 为 NULL", () => {
    const p = path.join(makeDbDir("ra-migrate-owner-"), "readalong.db");
    createLegacyAttemptsTable(p);

    const db = openDb(p);
    try {
      expect(columnNames(db, "practice_attempts")).toContain("owner");
      const row = db
        .prepare("SELECT unit_id, score, owner FROM practice_attempts")
        .get() as { unit_id: string; score: number; owner: string | null };
      expect(row).toEqual({
        unit_id: "u2-dragon-dance",
        score: 92,
        owner: null,
      });
    } finally {
      db.close();
    }
  });
});

describe("openDb 的 star_ledger（V0.4）", () => {
  it("新库建出 star_ledger 与唯一索引", () => {
    const p = path.join(makeDbDir("ra-stars-"), "readalong.db");
    const db = openDb(p);
    try {
      expect(columnNames(db, "star_ledger")).toEqual([
        "id",
        "account_id",
        "kind",
        "unit_id",
        "run_id",
        "stars",
        "base_stars",
        "doubled",
        "occurred_on",
        "week_start",
        "created_at",
      ]);
      const indexes = db
        .prepare("PRAGMA index_list(star_ledger)")
        .all() as Array<{ name: string }>;
      const names = indexes.map((index) => index.name);
      expect(names).toContain("idx_star_ledger_run");
      expect(names).toContain("idx_star_ledger_baseline");
      expect(names).toContain("idx_star_ledger_account_day");
      expect(names).toContain("idx_star_ledger_account_week");
    } finally {
      db.close();
    }
  });

  it("重复 openDb 幂等，旧库自动补建", () => {
    const p = path.join(makeDbDir("ra-stars-old-"), "readalong.db");
    const first = openDb(p);
    first.close();
    const second = openDb(p);
    try {
      expect(columnNames(second, "star_ledger")).toContain("occurred_on");
    } finally {
      second.close();
    }
  });
});
