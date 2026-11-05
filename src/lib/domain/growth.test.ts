import { describe, expect, it } from "vitest";
import { setupDb } from "@/lib/testing/auth-test-utils";
import { growthSnapshot } from "./growth";

// star_ledger.account_id has a real FK to accounts; better-sqlite3 enforces it.
function setupGrowthDb() {
  const db = setupDb("ra-growth");
  db.prepare(
    "INSERT INTO accounts (id, email, password_hash) VALUES ('acct-a', 'acct-a@test.com', 'x')"
  ).run();
  return db;
}

function ledger(
  db: ReturnType<typeof setupDb>,
  input: {
    accountId?: string;
    kind?: "baseline" | "run";
    unitId?: string;
    runId?: string | null;
    stars: number;
    occurredOn: string;
    weekStart?: string | null;
    createdAt?: string;
  }
): void {
  db.prepare(
    `INSERT INTO star_ledger
       (account_id, kind, unit_id, run_id, stars, base_stars, doubled, occurred_on, week_start, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`
  ).run(
    input.accountId ?? "acct-a",
    input.kind ?? "run",
    input.unitId ?? "u1",
    input.runId ?? null,
    input.stars,
    input.stars,
    input.occurredOn,
    input.weekStart ?? null,
    input.createdAt ?? "2026-11-05 01:00:00"
  );
}

function attemptOn(
  db: ReturnType<typeof setupDb>,
  date: string,
  owner = "acct-a"
): void {
  db.prepare(
    `INSERT INTO practice_attempts (unit_id, sentence_index, score, stars, owner, run_id, created_at)
     VALUES ('u1', 0, 80, 2, ?, 'partial-run', ?)`
  ).run(owner, `${date} 01:00:00`);
}

describe("growthSnapshot", () => {
  it("总星、当月星、打卡日、未完成日和余额", () => {
    const db = setupGrowthDb();
    ledger(db, {
      kind: "baseline",
      stars: 95,
      occurredOn: "2026-11-01",
      // Backfill happened on the 1st so the 2026-11-03 partial day is after launch.
      createdAt: "2026-11-01 01:00:00",
    });
    ledger(db, {
      stars: 30,
      occurredOn: "2026-11-04",
      weekStart: "2026-11-02",
      createdAt: "2026-11-04 01:00:00",
    });
    ledger(db, {
      stars: 44,
      occurredOn: "2026-11-05",
      weekStart: "2026-11-02",
      createdAt: "2026-11-05 01:00:00",
    });
    attemptOn(db, "2026-11-03");

    const snapshot = growthSnapshot(
      db,
      "acct-a",
      "2026-11",
      new Date("2026-11-05T12:00:00Z")
    );

    expect(snapshot.totalStars).toBe(169);
    expect(snapshot.monthStars).toBe(74);
    expect(snapshot.launchMonth).toBe("2026-11");
    expect(snapshot.preLaunch).toBe(false);
    expect(snapshot.streakDays).toBe(2);
    expect(snapshot.days.find((d) => d.date === "2026-11-04")).toEqual({
      date: "2026-11-04",
      stars: 30,
      checkedIn: true,
      partial: false,
    });
    expect(snapshot.days.find((d) => d.date === "2026-11-03")).toEqual({
      date: "2026-11-03",
      stars: 0,
      checkedIn: false,
      partial: true,
    });
    expect(snapshot.balances).toEqual([
      { date: "2026-11-01", balance: 95 },
      { date: "2026-11-02", balance: 95 },
      { date: "2026-11-03", balance: 95 },
      { date: "2026-11-04", balance: 125 },
      { date: "2026-11-05", balance: 169 },
    ]);
  });

  it("上线前月份：日历为空、无余额、monthStars=0", () => {
    const db = setupGrowthDb();
    ledger(db, {
      kind: "baseline",
      stars: 95,
      occurredOn: "2026-11-01",
      createdAt: "2026-11-05 01:00:00",
    });
    const snapshot = growthSnapshot(
      db,
      "acct-a",
      "2026-10",
      new Date("2026-11-05T12:00:00Z")
    );
    expect(snapshot.preLaunch).toBe(true);
    expect(snapshot.monthStars).toBe(0);
    expect(snapshot.balances).toEqual([]);
    expect(snapshot.days.every((d) => !d.checkedIn && !d.partial)).toBe(true);
    expect(snapshot.totalStars).toBe(95);
  });

  it("过去月份画满整月；当月只到今天", () => {
    const db = setupGrowthDb();
    ledger(db, {
      kind: "baseline",
      stars: 95,
      occurredOn: "2026-10-01",
      createdAt: "2026-10-05 01:00:00",
    });
    const past = growthSnapshot(
      db,
      "acct-a",
      "2026-10",
      new Date("2026-11-05T12:00:00Z")
    );
    expect(past.balances).toHaveLength(31);
    const current = growthSnapshot(
      db,
      "acct-a",
      "2026-11",
      new Date("2026-11-05T12:00:00Z")
    );
    expect(current.balances).toHaveLength(5);
  });

  it("今天没打卡但昨天打卡：连续天数从昨天算", () => {
    const db = setupGrowthDb();
    ledger(db, {
      stars: 10,
      occurredOn: "2026-11-03",
      weekStart: "2026-11-02",
      createdAt: "2026-11-03 01:00:00",
    });
    ledger(db, {
      stars: 10,
      occurredOn: "2026-11-04",
      weekStart: "2026-11-02",
      createdAt: "2026-11-04 01:00:00",
    });
    const snapshot = growthSnapshot(
      db,
      "acct-a",
      "2026-11",
      new Date("2026-11-05T12:00:00Z")
    );
    expect(snapshot.streakDays).toBe(2);
  });

  it("没有账本时按当月、0 星处理", () => {
    const db = setupGrowthDb();
    const snapshot = growthSnapshot(
      db,
      "acct-a",
      "2026-11",
      new Date("2026-11-05T12:00:00Z")
    );
    expect(snapshot.totalStars).toBe(0);
    expect(snapshot.launchMonth).toBe("2026-11");
    expect(snapshot.preLaunch).toBe(false);
    expect(snapshot.balances).toHaveLength(5);
  });
});
