import path from "node:path";
import { mkdirSync } from "node:fs";
import Database from "better-sqlite3";

/** 数据库文件路径：DB_PATH 覆盖，默认 <cwd>/data/readalong.db；确保父目录存在。
 * 与 openDb 同住 db 模块——连接与库文件位置是一件事的两半。 */
export function dbPath(): string {
  const p =
    process.env.DB_PATH || path.join(process.cwd(), "data", "readalong.db");
  mkdirSync(path.dirname(p), { recursive: true });
  return p;
}

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
      -- 练习 run 归属（票 04）：一次 PracticeFlow 从 begin 到结束/中途退出为一轮，
      -- 轮内所有 attempt 共享一个 runId；老数据为 NULL（run 分组口径见 star-ledger.runStats）
      run_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_attempts_unit_sentence
      ON practice_attempts (unit_id, sentence_index);

    -- 账号与会话（ADR-0003）：邀请制建号，公网无自助注册入口
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      is_admin INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    -- 会话 id 是服务端生成的随机不透明 id（ADR-0003），退出即删行吊销
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(id),
      expires_at TEXT NOT NULL
    );

    -- 全局设置（v0.3.6）：键值对；内容可见性开关存这里。
    -- 键缺失一律按代码里的默认值处理（标准内容默认不对家庭账号开放）。
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    -- V0.4 星星账本：只增不减的账号级流水。
    -- baseline = 上线时按内容历史最好星一次性折算；run = 一次完整练习的入账。
    CREATE TABLE IF NOT EXISTS star_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id TEXT NOT NULL REFERENCES accounts(id),
      kind TEXT NOT NULL CHECK (kind IN ('baseline', 'run')),
      unit_id TEXT NOT NULL,
      run_id TEXT,
      stars INTEGER NOT NULL,
      base_stars INTEGER NOT NULL,
      doubled INTEGER NOT NULL DEFAULT 0,
      occurred_on TEXT NOT NULL,
      week_start TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_star_ledger_run
      ON star_ledger (account_id, run_id) WHERE run_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_star_ledger_baseline
      ON star_ledger (account_id, unit_id) WHERE kind = 'baseline';
    CREATE INDEX IF NOT EXISTS idx_star_ledger_account_day
      ON star_ledger (account_id, occurred_on);
    CREATE INDEX IF NOT EXISTS idx_star_ledger_account_week
      ON star_ledger (account_id, unit_id, week_start);

    -- 内容草稿（校对中间态只存 SQLite，不进内容包文件；spec Implementation Decisions）
    -- type 预留 standard：管理员将来用同一条上传/校对管线制作教材内容
    CREATE TABLE IF NOT EXISTS content_drafts (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(id),
      title TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'custom',
      status TEXT NOT NULL DEFAULT 'transcribing'
        CHECK (status IN ('transcribing', 'proofreading', 'published')),
      -- 视频相对 uploads 根目录的路径（<accountId>/<uuid>.<ext>），删草稿时一并清理
      video_path TEXT NOT NULL,
      -- 封面相对 uploads 根目录的路径（<accountId>/<uuid>.poster.jpg）；抽帧失败/未抽为 NULL（票 01）
      poster_path TEXT,
      -- 转写任务引用：按它向 TranscriptionService 轮询；失败信息可存、草稿保持
      -- transcribing 可重试（转写缝 ADR-0004）
      transcribe_task_id TEXT,
      transcribe_error TEXT,
      -- 标准内容草稿（12 号票）指向的教材单元与栏目（如 五上-U2 / Story time）；
      -- custom 草稿两列均为 NULL
      unit_id TEXT,
      module_kind TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_drafts_account ON content_drafts (account_id);

    -- 草稿句子：内部按毫秒存起止时间，定稿时转换为内容包约定的秒
    -- seq 从 0 起与 practice_attempts.sentence_index 同口径
    CREATE TABLE IF NOT EXISTS draft_sentences (
      draft_id TEXT NOT NULL REFERENCES content_drafts(id),
      seq INTEGER NOT NULL,
      text TEXT NOT NULL,
      start_ms INTEGER NOT NULL,
      end_ms INTEGER NOT NULL,
      -- 校对状态：auto=转写自动产出 / edited=人工改过 / confirmed=已确认（07/08 号票）
      proofread TEXT NOT NULL DEFAULT 'auto'
        CHECK (proofread IN ('auto', 'edited', 'confirmed')),
      PRIMARY KEY (draft_id, seq)
    );
  `);
  // 既有库补列（12 号票）：CREATE TABLE IF NOT EXISTS 对旧库不生效，缺列时 ALTER 补上。
  // SQLite 的 ALTER TABLE 无 IF NOT EXISTS，按 table_info 逐列判断；新库建表已含列则空操作。
  addColumnIfMissing(db, "content_drafts", "unit_id", "unit_id TEXT");
  addColumnIfMissing(db, "content_drafts", "module_kind", "module_kind TEXT");
  // 封面引用列（票 01）：旧库 ALTER 补上
  addColumnIfMissing(db, "content_drafts", "poster_path", "poster_path TEXT");
  // V0.1 早期建出的库可能没有 owner 列（多家庭归属，票 10）
  addColumnIfMissing(db, "practice_attempts", "owner", "owner TEXT");
  // V0.2 建出的库没有 run_id 列（练习 run 归属，票 04）
  addColumnIfMissing(db, "practice_attempts", "run_id", "run_id TEXT");
  // 成长页按账号 + 北京时间范围查「练过但未完成」的日子（V0.4）。
  // 必须放在补 owner 列之后：V0.1 旧库在 exec 时还没有 owner 列。
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_attempts_owner_created
      ON practice_attempts (owner, created_at);
  `);
  return db;
}

function addColumnIfMissing(
  db: Database.Database,
  table: string,
  column: string,
  decl: string
): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{
    name: string;
  }>;
  if (!columns.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${decl}`);
  }
}

export type Db = Database.Database;
