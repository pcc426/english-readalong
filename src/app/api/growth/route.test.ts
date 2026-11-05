import { describe, expect, it } from "vitest";
import { GET } from "./route";
import {
  setupDb,
  authedGet,
  sessionCookieFor,
} from "@/lib/testing/auth-test-utils";
import {
  beijingMonthOf,
  beijingToday,
  beijingWeekStart,
  monthRange,
} from "@/lib/domain/beijing-date";

function get(month?: string) {
  const url = month
    ? `http://x/api/growth?month=${month}`
    : "http://x/api/growth";
  return GET(authedGet(url));
}

describe("GET /api/growth", () => {
  it("未登录 401", async () => {
    setupDb("ra-growth-api");
    const res = await GET(new Request("http://x/api/growth"));
    expect(res.status).toBe(401);
  });

  it("返回总星、连续天数、月历和余额", async () => {
    const db = setupDb("ra-growth-api");
    // 用 sessionCookieFor 建号后再拿 id
    sessionCookieFor("parent@test.com");
    const account = db
      .prepare("SELECT id FROM accounts WHERE email = 'parent@test.com'")
      .get() as { id: string };
    const today = beijingToday();
    const month = beijingMonthOf(today);
    db.prepare(
      `INSERT INTO star_ledger
         (account_id, kind, unit_id, run_id, stars, base_stars, doubled, occurred_on, week_start, created_at)
       VALUES (?, 'baseline', 'u1', NULL, 95, 95, 0, ?, NULL, ?)`
    ).run(account.id, `${month}-01`, `${today} 01:00:00`);
    db.prepare(
      `INSERT INTO star_ledger
         (account_id, kind, unit_id, run_id, stars, base_stars, doubled, occurred_on, week_start, created_at)
       VALUES (?, 'run', 'u1', 'r1', 30, 30, 0, ?, ?, ?)`
    ).run(account.id, today, beijingWeekStart(today), `${today} 01:00:00`);

    const res = await get(month);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.totalStars).toBe(125);
    expect(body.monthStars).toBe(30);
    expect(body.preLaunch).toBe(false);
    expect(body.streakDays).toBe(1);
    expect(body.days.find((d: { date: string }) => d.date === today)).toEqual({
      date: today,
      stars: 30,
      checkedIn: true,
      partial: false,
    });
    expect(body.balances[body.balances.length - 1]).toEqual({
      date: today,
      balance: 125,
    });
  });

  it("month 缺省为当前北京月", async () => {
    setupDb("ra-growth-api");
    const res = await get();
    expect(res.status).toBe(200);
    expect((await res.json()).month).toBe(beijingMonthOf(beijingToday()));
  });

  it("非法 month 返回 400", async () => {
    setupDb("ra-growth-api");
    const res = await get("2026-13");
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("INVALID_MONTH");
  });

  it("超出 12 个月返回 400", async () => {
    setupDb("ra-growth-api");
    const current = beijingMonthOf(beijingToday());
    const tooOld = monthRange(current, 11)[11];
    const res = await get(tooOld);
    expect(res.status).toBe(200);
    expect((await res.json()).month).toBe(tooOld);
    const older = monthRange(current, 12)[12];
    const res2 = await get(older);
    expect(res2.status).toBe(400);
  });
});
