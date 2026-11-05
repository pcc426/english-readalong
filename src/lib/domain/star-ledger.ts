import type { Db } from "../db";
import { beijingDateOf, beijingWeekStart } from "./beijing-date";

export interface RunStats {
  covered: number;
  baseStars: number;
  threeStarCount: number;
}

export interface RunAward {
  complete: boolean;
  stars: number | null;
  baseStars: number | null;
  doubled: boolean;
  weeklyRuns: number;
  weeklyLimitReached: boolean;
}

export function runStats(
  db: Db,
  accountId: string,
  unitId: string,
  runId: string
): RunStats {
  const rows = db
    .prepare(
      `SELECT sentence_index, MAX(stars) AS stars
       FROM practice_attempts
       WHERE owner = ? AND unit_id = ? AND run_id = ?
       GROUP BY sentence_index`
    )
    .all(accountId, unitId, runId) as Array<{
    sentence_index: number;
    stars: number;
  }>;
  return {
    covered: rows.length,
    baseStars: rows.reduce((sum, row) => sum + row.stars, 0),
    threeStarCount: rows.filter((row) => row.stars === 3).length,
  };
}

export function weeklyRunsFor(
  db: Db,
  accountId: string,
  unitId: string,
  date: string
): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM star_ledger
       WHERE account_id = ? AND unit_id = ? AND kind = 'run' AND week_start = ?`
    )
    .get(accountId, unitId, beijingWeekStart(date)) as { n: number };
  return row.n;
}

export function awardRunIfComplete(
  db: Db,
  input: {
    accountId: string;
    unitId: string;
    runId: string;
    sentenceCount: number;
    completedAt: string;
  }
): RunAward {
  const stats = runStats(db, input.accountId, input.unitId, input.runId);
  const occurredOn = beijingDateOf(input.completedAt);
  if (stats.covered !== input.sentenceCount) {
    return {
      complete: false,
      stars: null,
      baseStars: null,
      doubled: false,
      weeklyRuns: weeklyRunsFor(db, input.accountId, input.unitId, occurredOn),
      weeklyLimitReached: false,
    };
  }

  const existing = db
    .prepare(
      `SELECT id FROM star_ledger WHERE account_id = ? AND run_id = ?`
    )
    .get(input.accountId, input.runId) as { id: number } | undefined;
  const doubled =
    stats.threeStarCount >= Math.round(input.sentenceCount * 0.9);
  const stars = doubled ? stats.baseStars * 2 : stats.baseStars;

  if (existing) {
    db.prepare(
      `UPDATE star_ledger SET stars = ?, base_stars = ?, doubled = ?
       WHERE id = ?`
    ).run(stars, stats.baseStars, doubled ? 1 : 0, existing.id);
    return {
      complete: true,
      stars,
      baseStars: stats.baseStars,
      doubled,
      weeklyRuns: weeklyRunsFor(db, input.accountId, input.unitId, occurredOn),
      weeklyLimitReached: false,
    };
  }

  const weeklyRuns = weeklyRunsFor(
    db,
    input.accountId,
    input.unitId,
    occurredOn
  );
  if (weeklyRuns >= 3) {
    return {
      complete: true,
      stars: null,
      baseStars: stats.baseStars,
      doubled,
      weeklyRuns,
      weeklyLimitReached: true,
    };
  }

  db.prepare(
    `INSERT INTO star_ledger
       (account_id, kind, unit_id, run_id, stars, base_stars, doubled, occurred_on, week_start)
     VALUES (?, 'run', ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    input.accountId,
    input.unitId,
    input.runId,
    stars,
    stats.baseStars,
    doubled ? 1 : 0,
    occurredOn,
    beijingWeekStart(occurredOn)
  );

  return {
    complete: true,
    stars,
    baseStars: stats.baseStars,
    doubled,
    weeklyRuns: weeklyRuns + 1,
    weeklyLimitReached: false,
  };
}

export function latestAwardedRunStars(
  db: Db,
  accountId: string,
  unitId: string
): number | null {
  const row = db
    .prepare(
      `SELECT stars FROM star_ledger
       WHERE account_id = ? AND unit_id = ? AND kind = 'run'
       ORDER BY occurred_on DESC, id DESC LIMIT 1`
    )
    .get(accountId, unitId) as { stars: number } | undefined;
  return row?.stars ?? null;
}

export function totalStars(db: Db, accountId: string): number {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(stars), 0) AS total FROM star_ledger WHERE account_id = ?`
    )
    .get(accountId) as { total: number };
  return row.total;
}
