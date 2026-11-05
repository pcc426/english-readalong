import { describe, expect, it } from "vitest";
import { setupDb } from "@/lib/testing/auth-test-utils";
import { backfillBaselineStars } from "./baseline";

// star_ledger.account_id has a real FK to accounts; better-sqlite3 12.4.1
// enables foreign keys by default (verified empirically). Create the test
// accounts before any ledger row is written.
function setupBaselineDb() {
  const db = setupDb("ra-baseline");
  const insert = db.prepare(
    "INSERT INTO accounts (id, email, password_hash) VALUES (?, ?, 'x')"
  );
  insert.run("acct-a", "acct-a@test.com");
  insert.run("admin", "admin@test.com");
  return db;
}

function attempt(
  db: ReturnType<typeof setupDb>,
  owner: string | null,
  unitId: string,
  sentenceIndex: number,
  stars: number,
  createdAt?: string
): void {
  const sql = createdAt
    ? `INSERT INTO practice_attempts
         (unit_id, sentence_index, score, stars, owner, run_id, created_at)
       VALUES (?, ?, ?, ?, ?, NULL, ?)`
    : `INSERT INTO practice_attempts
         (unit_id, sentence_index, score, stars, owner, run_id)
       VALUES (?, ?, ?, ?, ?, NULL)`;
  const params = [unitId, sentenceIndex, stars * 30 + 10, stars, owner];
  const stmt = db.prepare(sql);
  if (createdAt) stmt.run(...params, createdAt);
  else stmt.run(...params);
}

describe("backfillBaselineStars", () => {
  it("按每个内容的每句历史最高星折算，不写 run/打卡", () => {
    const db = setupBaselineDb();
    attempt(db, "acct-a", "u1", 0, 2);
    attempt(db, "acct-a", "u1", 0, 3);
    attempt(db, "acct-a", "u1", 1, 2);
    attempt(db, "acct-a", "u2", 0, 1);

    const report = backfillBaselineStars(db, { launchMonth: "2026-11" });

    expect(report.rows).toEqual([
      { accountId: "acct-a", unitId: "u1", stars: 5, inserted: true },
      { accountId: "acct-a", unitId: "u2", stars: 1, inserted: true },
    ]);
    expect(report.launchMonth).toBe("2026-11");
    expect(report.skippedNullOwner).toBe(0);
    const stored = db
      .prepare(
        `SELECT kind, unit_id, stars, base_stars, doubled, occurred_on, week_start
         FROM star_ledger WHERE account_id = 'acct-a' ORDER BY unit_id`
      )
      .all();
    expect(stored).toEqual([
      {
        kind: "baseline",
        unit_id: "u1",
        stars: 5,
        base_stars: 5,
        doubled: 0,
        occurred_on: "2026-11-01",
        week_start: null,
      },
      {
        kind: "baseline",
        unit_id: "u2",
        stars: 1,
        base_stars: 1,
        doubled: 0,
        occurred_on: "2026-11-01",
        week_start: null,
      },
    ]);
    expect(
      db.prepare(`SELECT COUNT(*) AS n FROM star_ledger WHERE kind = 'run'`).get()
    ).toEqual({ n: 0 });
  });

  it("NULL owner 并入管理员，并按句取最高星后再汇总", () => {
    const db = setupBaselineDb();
    attempt(db, "admin", "u1", 0, 3);
    attempt(db, null, "u1", 0, 2);
    attempt(db, null, "u1", 1, 2);

    const report = backfillBaselineStars(db, {
      launchMonth: "2026-11",
      adminAccountId: "admin",
    });

    // 按句取最高星再汇总：3 + 2 = 5。
    // 若先按 owner 汇总再取最大值会是 4（max(admin 3, NULL 4)），简单相加会是 7。
    expect(report.rows).toEqual([
      { accountId: "admin", unitId: "u1", stars: 5, inserted: true },
    ]);
    expect(report.skippedNullOwner).toBe(0);
  });

  it("幂等：第二次执行不新增", () => {
    const db = setupBaselineDb();
    attempt(db, "acct-a", "u1", 0, 3);
    const first = backfillBaselineStars(db, { launchMonth: "2026-11" });
    const second = backfillBaselineStars(db, { launchMonth: "2026-11" });
    expect(first.rows.every((row) => row.inserted)).toBe(true);
    expect(second.rows).toEqual([
      { accountId: "acct-a", unitId: "u1", stars: 3, inserted: false },
    ]);
    expect(
      db.prepare(`SELECT COUNT(*) AS n FROM star_ledger`).get()
    ).toEqual({ n: 1 });
  });

  it("重复回填不把上线后的练习折成新 baseline", () => {
    const db = setupBaselineDb();
    attempt(db, "acct-a", "u1", 0, 3, "2026-11-01 01:00:00");
    const first = backfillBaselineStars(db, {
      launchMonth: "2026-11",
      cutoff: "2026-11-05 00:00:00",
    });
    expect(first.rows).toEqual([
      { accountId: "acct-a", unitId: "u1", stars: 3, inserted: true },
    ]);
    attempt(db, "acct-a", "u2", 0, 3, "2026-11-06 01:00:00");
    const second = backfillBaselineStars(db, {
      launchMonth: "2026-12",
      cutoff: "2026-12-05 00:00:00",
    });
    expect(second.rows).toEqual([
      { accountId: "acct-a", unitId: "u1", stars: 3, inserted: false },
    ]);
    expect(second.launchMonth).toBe("2026-11");
    expect(
      db.prepare("SELECT COUNT(*) AS n FROM star_ledger WHERE kind = 'baseline'").get()
    ).toEqual({ n: 1 });
  });

  it("没有管理员时跳过 NULL owner 并报告数量", () => {
    const db = setupBaselineDb();
    attempt(db, null, "u1", 0, 3);
    const report = backfillBaselineStars(db, {
      launchMonth: "2026-11",
      adminAccountId: null,
    });
    expect(report.rows).toEqual([]);
    expect(report.skippedNullOwner).toBeGreaterThan(0);
  });
});
