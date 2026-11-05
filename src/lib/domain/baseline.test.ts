import { describe, expect, it } from "vitest";
import { setupDb } from "@/lib/testing/auth-test-utils";
import { backfillBaselineStars } from "./baseline";

// star_ledger.account_id has a real FK to accounts; better-sqlite3 enforces it.
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
  stars: number
): void {
  db.prepare(
    `INSERT INTO practice_attempts (unit_id, sentence_index, score, stars, owner, run_id)
     VALUES (?, ?, ?, ?, ?, NULL)`
  ).run(unitId, sentenceIndex, stars * 30 + 10, stars, owner);
}

describe("backfillBaselineStars", () => {
  it("按每个内容的每句历史最高星折算，不写 run/打卡", () => {
    const db = setupBaselineDb();
    attempt(db, "acct-a", "u1", 0, 2);
    attempt(db, "acct-a", "u1", 0, 3);
    attempt(db, "acct-a", "u1", 1, 2);
    attempt(db, "acct-a", "u2", 0, 1);

    const rows = backfillBaselineStars(db, { launchMonth: "2026-11" });

    expect(rows).toEqual([
      { accountId: "acct-a", unitId: "u1", stars: 5, inserted: true },
      { accountId: "acct-a", unitId: "u2", stars: 1, inserted: true },
    ]);
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
    attempt(db, "admin", "u1", 0, 2);
    attempt(db, null, "u1", 0, 3);
    attempt(db, null, "u1", 1, 2);

    const rows = backfillBaselineStars(db, {
      launchMonth: "2026-11",
      adminAccountId: "admin",
    });

    expect(rows).toEqual([
      { accountId: "admin", unitId: "u1", stars: 5, inserted: true },
    ]);
  });

  it("幂等：第二次执行不新增", () => {
    const db = setupBaselineDb();
    attempt(db, "acct-a", "u1", 0, 3);
    const first = backfillBaselineStars(db, { launchMonth: "2026-11" });
    const second = backfillBaselineStars(db, { launchMonth: "2026-11" });
    expect(first.every((row) => row.inserted)).toBe(true);
    expect(second).toEqual([
      { accountId: "acct-a", unitId: "u1", stars: 3, inserted: false },
    ]);
    expect(
      db.prepare(`SELECT COUNT(*) AS n FROM star_ledger`).get()
    ).toEqual({ n: 1 });
  });
});
