import type { Db } from "../db";
import {
  beijingDateOf,
  beijingMonthOf,
  beijingToday,
  daysInMonth,
  monthDates,
  shiftDate,
  shiftMonth,
} from "./beijing-date";
import { totalStars } from "./star-ledger";

export interface GrowthDay {
  date: string;
  stars: number;
  checkedIn: boolean;
  partial: boolean;
}

export interface GrowthBalance {
  date: string;
  balance: number;
}

export interface GrowthSnapshot {
  totalStars: number;
  streakDays: number;
  launchMonth: string;
  launchDate: string;
  month: string;
  isCurrentMonth: boolean;
  preLaunch: boolean;
  monthStars: number;
  days: GrowthDay[];
  balances: GrowthBalance[];
}

export function growthSnapshot(
  db: Db,
  accountId: string,
  month: string,
  now: Date = new Date()
): GrowthSnapshot {
  const today = beijingToday(now);
  const currentMonth = beijingMonthOf(now);
  const launchRow = db
    .prepare(
      `SELECT MIN(created_at) AS created FROM star_ledger WHERE account_id = ?`
    )
    .get(accountId) as { created: string | null };
  const launchDate = launchRow.created ? beijingDateOf(launchRow.created) : today;
  const launchMonth = launchDate.slice(0, 7);
  const preLaunch = month < launchMonth;
  const isCurrentMonth = month === currentMonth;
  const monthStart = `${month}-01`;
  const monthEnd = `${month}-${String(daysInMonth(month)).padStart(2, "0")}`;

  const runRows = db
    .prepare(
      `SELECT occurred_on AS date, SUM(stars) AS stars
       FROM star_ledger
       WHERE account_id = ? AND kind = 'run' AND occurred_on BETWEEN ? AND ?
       GROUP BY occurred_on`
    )
    .all(accountId, monthStart, monthEnd) as Array<{
    date: string;
    stars: number;
  }>;
  const runDayMap = new Map(runRows.map((row) => [row.date, row.stars]));

  const nextMonthStart = `${shiftMonth(month, 1)}-01`;
  const attemptRows = db
    .prepare(
      `SELECT DISTINCT date(created_at, '+8 hours') AS date
       FROM practice_attempts
       WHERE owner = ?
         AND created_at >= datetime(?, '-8 hours')
         AND created_at < datetime(?, '-8 hours')`
    )
    .all(accountId, monthStart, nextMonthStart) as Array<{ date: string }>;
  const attemptDays = new Set(attemptRows.map((row) => row.date));

  const days = monthDates(month).map((date) => {
    const stars = preLaunch ? 0 : (runDayMap.get(date) ?? 0);
    const checkedIn = !preLaunch && runDayMap.has(date);
    const partial =
      !preLaunch &&
      !checkedIn &&
      attemptDays.has(date) &&
      date >= launchDate;
    return { date, stars, checkedIn, partial };
  });

  const monthStars = preLaunch
    ? 0
    : runRows.reduce((sum, row) => sum + row.stars, 0);

  let balances: GrowthBalance[] = [];
  if (!preLaunch) {
    const allRows = db
      .prepare(
        `SELECT occurred_on AS date, SUM(stars) AS stars
         FROM star_ledger
         WHERE account_id = ? AND occurred_on <= ?
         GROUP BY occurred_on
         ORDER BY occurred_on`
      )
      .all(accountId, monthEnd) as Array<{ date: string; stars: number }>;
    const byDate = new Map(allRows.map((row) => [row.date, row.stars]));
    let balance = 0;
    for (const row of allRows) {
      if (row.date < monthStart) balance += row.stars;
    }
    const lastDay = isCurrentMonth
      ? Math.min(daysInMonth(month), Number(today.slice(8, 10)))
      : daysInMonth(month);
    balances = monthDates(month)
      .slice(0, lastDay)
      .map((date) => {
        balance += byDate.get(date) ?? 0;
        return { date, balance };
      });
  }

  const checkInRows = db
    .prepare(
      `SELECT DISTINCT occurred_on AS date
       FROM star_ledger
       WHERE account_id = ? AND kind = 'run'
       ORDER BY occurred_on DESC`
    )
    .all(accountId) as Array<{ date: string }>;
  const checkInSet = new Set(checkInRows.map((row) => row.date));
  let streakDays = 0;
  let cursor: string | null = null;
  if (checkInSet.has(today)) cursor = today;
  else if (checkInSet.has(shiftDate(today, -1))) cursor = shiftDate(today, -1);
  while (cursor && checkInSet.has(cursor)) {
    streakDays += 1;
    cursor = shiftDate(cursor, -1);
  }

  return {
    totalStars: totalStars(db, accountId),
    streakDays,
    launchMonth,
    launchDate,
    month,
    isCurrentMonth,
    preLaunch,
    monthStars,
    days,
    balances,
  };
}
