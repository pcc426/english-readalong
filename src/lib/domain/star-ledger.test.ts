import { describe, expect, it } from "vitest";
import { setupDb } from "@/lib/testing/auth-test-utils";
import {
  awardRunIfComplete,
  latestAwardedRunStars,
  totalStars,
  weeklyRunsFor,
} from "./star-ledger";

// star_ledger.account_id has a real FK to accounts; better-sqlite3 enforces it.
// Create the test accounts before any ledger row is written.
function setupLedgerDb() {
  const db = setupDb("ra-ledger");
  const insert = db.prepare(
    "INSERT INTO accounts (id, email, password_hash) VALUES (?, ?, 'x')"
  );
  insert.run("acct-a", "acct-a@test.com");
  insert.run("acct-b", "acct-b@test.com");
  return db;
}

function attempt(
  db: ReturnType<typeof setupDb>,
  unitId: string,
  sentenceIndex: number,
  stars: number,
  runId: string,
  owner = "acct-a"
): void {
  db.prepare(
    `INSERT INTO practice_attempts
       (unit_id, sentence_index, score, stars, owner, run_id)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(unitId, sentenceIndex, stars * 30 + 10, stars, owner, runId);
}

function ledgerRows(db: ReturnType<typeof setupDb>, owner = "acct-a") {
  return db
    .prepare(
      `SELECT kind, unit_id, run_id, stars, base_stars, doubled, occurred_on, week_start
       FROM star_ledger WHERE account_id = ? ORDER BY id`
    )
    .all(owner) as Array<{
    kind: string;
    unit_id: string;
    run_id: string | null;
    stars: number;
    base_stars: number;
    doubled: number;
    occurred_on: string;
    week_start: string | null;
  }>;
}

describe("runStats / awardRunIfComplete", () => {
  it("缺一句时不算完整，不写账本", () => {
    const db = setupLedgerDb();
    attempt(db, "u1", 0, 3, "run-1");
    const award = awardRunIfComplete(db, {
      accountId: "acct-a",
      unitId: "u1",
      runId: "run-1",
      sentenceCount: 2,
      completedAt: "2026-11-05 01:00:00",
    });
    expect(award).toMatchObject({
      complete: false,
      stars: null,
      weeklyRuns: 0,
    });
    expect(ledgerRows(db)).toHaveLength(0);
  });

  it("完整后按每句本轮最高星入账", () => {
    const db = setupLedgerDb();
    attempt(db, "u1", 0, 2, "run-1");
    attempt(db, "u1", 0, 3, "run-1");
    attempt(db, "u1", 1, 2, "run-1");
    const award = awardRunIfComplete(db, {
      accountId: "acct-a",
      unitId: "u1",
      runId: "run-1",
      sentenceCount: 2,
      completedAt: "2026-11-05 01:00:00",
    });
    expect(award).toMatchObject({
      complete: true,
      baseStars: 5,
      stars: 5,
      doubled: false,
      weeklyRuns: 1,
    });
    expect(ledgerRows(db)[0]).toMatchObject({
      kind: "run",
      unit_id: "u1",
      run_id: "run-1",
      stars: 5,
      base_stars: 5,
      doubled: 0,
      occurred_on: "2026-11-05",
      week_start: "2026-11-02",
    });
  });

  it("15 句 14 句三星时翻倍：base 44 → 88", () => {
    const db = setupLedgerDb();
    for (let index = 0; index < 14; index += 1) {
      attempt(db, "u15", index, 3, "run-double");
    }
    attempt(db, "u15", 14, 2, "run-double");
    const award = awardRunIfComplete(db, {
      accountId: "acct-a",
      unitId: "u15",
      runId: "run-double",
      sentenceCount: 15,
      completedAt: "2026-11-05 01:00:00",
    });
    expect(award).toMatchObject({
      complete: true,
      baseStars: 44,
      doubled: true,
      stars: 88,
    });
  });

  it("13 句三星 / 15 句不翻倍", () => {
    const db = setupLedgerDb();
    for (let index = 0; index < 13; index += 1) {
      attempt(db, "u15", index, 3, "run-no-double");
    }
    for (let index = 13; index < 15; index += 1) {
      attempt(db, "u15", index, 2, "run-no-double");
    }
    const award = awardRunIfComplete(db, {
      accountId: "acct-a",
      unitId: "u15",
      runId: "run-no-double",
      sentenceCount: 15,
      completedAt: "2026-11-05 01:00:00",
    });
    expect(award.doubled).toBe(false);
    expect(award.stars).toBe(43);
  });

  it("同 run 补读提高星数时更新同一行，不新增", () => {
    const db = setupLedgerDb();
    attempt(db, "u1", 0, 2, "run-1");
    attempt(db, "u1", 1, 2, "run-1");
    const first = awardRunIfComplete(db, {
      accountId: "acct-a",
      unitId: "u1",
      runId: "run-1",
      sentenceCount: 2,
      completedAt: "2026-11-05 01:00:00",
    });
    expect(first.stars).toBe(4);
    attempt(db, "u1", 0, 3, "run-1");
    const second = awardRunIfComplete(db, {
      accountId: "acct-a",
      unitId: "u1",
      runId: "run-1",
      sentenceCount: 2,
      completedAt: "2026-11-06 01:00:00",
    });
    expect(second.stars).toBe(5);
    const rows = ledgerRows(db);
    expect(rows).toHaveLength(1);
    expect(rows[0].stars).toBe(5);
    expect(rows[0].occurred_on).toBe("2026-11-05");
    expect(rows[0].week_start).toBe("2026-11-02");
  });

  it("同一内容第 4 次完整练习被限次，不写账本", () => {
    const db = setupLedgerDb();
    for (const runId of ["r1", "r2", "r3"]) {
      attempt(db, "u1", 0, 3, runId);
      attempt(db, "u1", 1, 3, runId);
      awardRunIfComplete(db, {
        accountId: "acct-a",
        unitId: "u1",
        runId,
        sentenceCount: 2,
        completedAt: "2026-11-05 01:00:00",
      });
    }
    attempt(db, "u1", 0, 3, "r4");
    attempt(db, "u1", 1, 3, "r4");
    const fourth = awardRunIfComplete(db, {
      accountId: "acct-a",
      unitId: "u1",
      runId: "r4",
      sentenceCount: 2,
      completedAt: "2026-11-05 02:00:00",
    });
    expect(fourth).toMatchObject({
      complete: true,
      stars: null,
      weeklyRuns: 3,
      weeklyLimitReached: true,
    });
    expect(ledgerRows(db)).toHaveLength(3);
  });

  it("不同内容独立计数；每周一重置", () => {
    const db = setupLedgerDb();
    for (const runId of ["r1", "r2", "r3"]) {
      attempt(db, "u1", 0, 3, runId);
      attempt(db, "u1", 1, 3, runId);
      awardRunIfComplete(db, {
        accountId: "acct-a",
        unitId: "u1",
        runId,
        sentenceCount: 2,
        completedAt: "2026-11-05 01:00:00",
      });
    }
    expect(weeklyRunsFor(db, "acct-a", "u1", "2026-11-05")).toBe(3);
    expect(weeklyRunsFor(db, "acct-a", "u1", "2026-11-09")).toBe(0);
    expect(weeklyRunsFor(db, "acct-a", "u2", "2026-11-05")).toBe(0);
  });
});

describe("latestAwardedRunStars / totalStars", () => {
  it("取最近一次完整练习的入账星，含翻倍", () => {
    const db = setupLedgerDb();
    db.prepare(
      `INSERT INTO star_ledger
         (account_id, kind, unit_id, run_id, stars, base_stars, doubled, occurred_on, week_start)
       VALUES ('acct-a', 'baseline', 'u0', NULL, 10, 10, 0, '2026-11-01', NULL)`
    ).run();
    db.prepare(
      `INSERT INTO star_ledger
         (account_id, kind, unit_id, run_id, stars, base_stars, doubled, occurred_on, week_start)
       VALUES ('acct-a', 'run', 'u1', 'r1', 5, 5, 0, '2026-11-04', '2026-11-02')`
    ).run();
    db.prepare(
      `INSERT INTO star_ledger
         (account_id, kind, unit_id, run_id, stars, base_stars, doubled, occurred_on, week_start)
       VALUES ('acct-a', 'run', 'u1', 'r2', 88, 44, 1, '2026-11-05', '2026-11-02')`
    ).run();
    expect(latestAwardedRunStars(db, "acct-a", "u1")).toBe(88);
    expect(latestAwardedRunStars(db, "acct-a", "other")).toBeNull();
    expect(totalStars(db, "acct-a")).toBe(103); // 5 + 88 + 10 baseline
  });

  it("账号隔离", () => {
    const db = setupLedgerDb();
    db.prepare(
      `INSERT INTO star_ledger
         (account_id, kind, unit_id, run_id, stars, base_stars, doubled, occurred_on, week_start)
       VALUES ('acct-a', 'run', 'u1', 'r1', 5, 5, 0, '2026-11-05', '2026-11-02')`
    ).run();
    db.prepare(
      `INSERT INTO star_ledger
         (account_id, kind, unit_id, run_id, stars, base_stars, doubled, occurred_on, week_start)
       VALUES ('acct-b', 'run', 'u1', 'r2', 7, 7, 0, '2026-11-05', '2026-11-02')`
    ).run();
    expect(latestAwardedRunStars(db, "acct-a", "u1")).toBe(5);
    expect(latestAwardedRunStars(db, "acct-b", "u1")).toBe(7);
    expect(totalStars(db, "acct-a")).toBe(5);
  });
});
