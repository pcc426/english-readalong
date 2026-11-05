# V0.4 我的成长与星星积分体系 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立账号级星星账本，交付「我的成长」首页（累计星星、连续打卡、月历、余额曲线），并把 `/` 改为成长页、`/units` 承接教材列表。

**Architecture:** SQLite 新增只增不减的 `star_ledger` 流水表；完整练习在 practice 路由的同一事务里入账；每周上限、翻倍、初始星星都从账本派生。读侧由 `growthSnapshot` 聚合出月历与余额曲线，前端用内联 SVG 画曲线，不引入图表库。

**Tech Stack:** Next.js 15 App Router、TypeScript、Tailwind CSS 4、SQLite/better-sqlite3、Vitest、tsx。

**Plan location:** `.scratch/v04/plan.md`（项目约定；默认的 `docs/superpowers/plans/` 由本仓库覆盖）
**Spec:** `.scratch/v04/spec.md`
**Decision log:** `.scratch/v04/grilling-decisions.md`

---

## File Structure

### New files

| Path | Responsibility |
|---|---|
| `src/lib/domain/beijing-date.ts` | 北京时间日/周/月工具，固定 UTC+8 |
| `src/lib/domain/star-ledger.ts` | run 入账、每周次数、最近入账星、总星数 |
| `src/lib/domain/growth.ts` | 月历、连续天数、余额曲线的读侧聚合 |
| `src/lib/domain/baseline.ts` | 初始星星回填逻辑（可测试） |
| `scripts/backfill-baseline-stars.ts` | 回填脚本薄封装 |
| `src/app/api/growth/route.ts` | `GET /api/growth` |
| `src/components/shared/Modal.tsx` | 站内弹窗基础组件 |
| `src/components/shared/WeeklyLimitModal.tsx` | 本周次数用完弹窗 |
| `src/components/growth/types.ts` | 客户端成长页响应类型 |
| `src/components/growth/MonthSwitcher.tsx` | 月份切换 |
| `src/components/growth/Calendar.tsx` | 打卡月历 |
| `src/components/growth/BalanceCurve.tsx` | 余额曲线 SVG |
| `src/components/growth/GrowthView.tsx` | 成长页客户端容器 |

### Modified files

| Path | Change |
|---|---|
| `src/lib/db.ts` | 建 `star_ledger` 表与索引 |
| `src/lib/content/view.ts` | `ContentOverview` / `ContentDetail` 增加 `weeklyRuns` |
| `src/lib/owned-content.ts` | 列表/详情填 `weeklyRuns` 与账本入账星 |
| `src/lib/domain/stats.ts` | 删除 `latestRunStars`（由账本查询替代） |
| `src/lib/domain/stats.test.ts` | 删除 `latestRunStars` 测试块（等价测试移到 `star-ledger.test.ts`） |
| `src/app/api/drafts/route.ts` | published 行增加 `weeklyRuns`，星数读账本 |
| `src/app/api/units/[id]/practice/route.ts` | 限次、事务入账、返回 run 汇总 |
| `src/app/(shell)/page.tsx` | 改为成长页 |
| `src/app/(shell)/units/page.tsx` | 原教材列表移到这里 |
| `src/app/(shell)/units/home-grid.ts` | 原 `(shell)/home-grid.ts` 移到这里 |
| `src/app/(shell)/units/home-grid.test.ts` | 原测试随文件移动 |
| `src/app/(shell)/units/[id]/page.tsx` | 把 `weeklyRuns` 传给 `PracticeFlow` |
| `src/app/(shell)/units/[id]/PracticeFlow.tsx` | 限次拦截、run 汇总、结束页三态 |
| `src/app/(shell)/custom/page.tsx` | 卡片限次拦截、`weeklyRuns`、入账星文案 |
| `src/app/(shell)/layout.tsx` | 删除家庭账号 `/` → `/custom` 重定向 |
| `src/components/shell/Sidebar.tsx` | 新增「我的成长」，教材内容改 `/units` |
| `scripts/deploy.sh` | 重启前跑初始星星回填 |
| `docs/deploy.md` | 回填命令与核对说明 |
| `package.json` | 增加 `backfill:stars` |

### Delete at the end

- `src/app/prototype/v04-growth/page.tsx`（原型只用于评审，正式实现不复制它）

---

## Task 1: 北京时间工具

**Files:**
- Create: `src/lib/domain/beijing-date.ts`
- Test: `src/lib/domain/beijing-date.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it } from "vitest";
import {
  beijingDateOf,
  beijingMonthOf,
  beijingToday,
  beijingWeekStart,
  daysInMonth,
  isValidMonth,
  leadingBlanks,
  monthDates,
  monthRange,
  shiftDate,
  shiftMonth,
} from "./beijing-date";

describe("beijing-date", () => {
  it("SQLite UTC 字符串按 +8 折算，跨北京午夜正确", () => {
    expect(beijingDateOf("2026-11-04 16:30:00")).toBe("2026-11-05");
    expect(beijingDateOf("2026-11-04 15:59:59")).toBe("2026-11-04");
    expect(beijingDateOf("2026-11-04T16:30:00Z")).toBe("2026-11-05");
  });

  it("周一为每周起点", () => {
    expect(beijingWeekStart("2026-11-02")).toBe("2026-11-02");
    expect(beijingWeekStart("2026-11-05")).toBe("2026-11-02");
    expect(beijingWeekStart("2026-11-08")).toBe("2026-11-02");
  });

  it("月份工具覆盖闰年与跨年", () => {
    expect(daysInMonth("2026-02")).toBe(28);
    expect(daysInMonth("2024-02")).toBe(29);
    expect(monthDates("2026-02")).toHaveLength(28);
    expect(monthDates("2024-02")[28]).toBe("2024-02-29");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(monthRange("2026-11", 11)).toHaveLength(12);
    expect(monthRange("2026-11", 11)[11]).toBe("2025-12");
    expect(isValidMonth("2026-11")).toBe(true);
    expect(isValidMonth("2026-13")).toBe(false);
    expect(isValidMonth("26-11")).toBe(false);
  });

  it("shiftDate 跨月跨年", () => {
    expect(shiftDate("2026-11-01", -1)).toBe("2026-10-31");
    expect(shiftDate("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("月历前置空格按周一起算", () => {
    // 2026-11-01 是周日 → 前面 6 个空格
    expect(leadingBlanks("2026-11")).toBe(6);
    // 2026-06-01 是周一 → 0 个空格
    expect(leadingBlanks("2026-06")).toBe(0);
  });

  it("beijingToday 使用注入时钟", () => {
    expect(beijingToday(new Date("2026-11-04T16:30:00Z"))).toBe("2026-11-05");
    expect(beijingMonthOf("2026-11-04 16:30:00")).toBe("2026-11");
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run:

```bash
npx vitest run src/lib/domain/beijing-date.test.ts
```

Expected: FAIL，`Cannot find module './beijing-date'`。

- [ ] **Step 3: 实现**

```ts
const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;

/** SQLite datetime('now') 是 UTC 的 "YYYY-MM-DD HH:MM:SS"；补 Z 再解析。 */
export function parseDbUtc(value: string): Date {
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  return new Date(normalized.endsWith("Z") ? normalized : `${normalized}Z`);
}

export function beijingDateOf(value: Date | string): string {
  const date = typeof value === "string" ? parseDbUtc(value) : value;
  return new Date(date.getTime() + BEIJING_OFFSET_MS).toISOString().slice(0, 10);
}

export function beijingMonthOf(value: Date | string): string {
  return beijingDateOf(value).slice(0, 7);
}

export function beijingToday(now: Date = new Date()): string {
  return beijingDateOf(now);
}

export function shiftDate(date: string, delta: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  utc.setUTCDate(utc.getUTCDate() + delta);
  return utc.toISOString().slice(0, 10);
}

/** 该日期所在周的周一（周一为 0，周日为 6）。 */
export function beijingWeekStart(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  return shiftDate(date, -((utc.getUTCDay() + 6) % 7));
}

export function isValidMonth(month: string): boolean {
  if (!/^\d{4}-\d{2}$/.test(month)) return false;
  const monthNo = Number(month.slice(5, 7));
  return monthNo >= 1 && monthNo <= 12;
}

export function daysInMonth(month: string): number {
  const [year, monthNo] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNo, 0)).getUTCDate();
}

export function monthDates(month: string): string[] {
  return Array.from(
    { length: daysInMonth(month) },
    (_, index) => `${month}-${String(index + 1).padStart(2, "0")}`
  );
}

export function shiftMonth(month: string, delta: number): string {
  const [year, monthNo] = month.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, monthNo - 1 + delta, 1));
  return `${shifted.getUTCFullYear()}-${String(
    shifted.getUTCMonth() + 1
  ).padStart(2, "0")}`;
}

/** current + 之前 monthsBack 个月；monthsBack=11 即共 12 个月。 */
export function monthRange(current: string, monthsBack: number): string[] {
  return Array.from({ length: monthsBack + 1 }, (_, index) =>
    shiftMonth(current, -index)
  );
}

/** 周一为第一列（0）；返回该月 1 日前面的空格数。 */
export function leadingBlanks(month: string): number {
  const [year, monthNo] = month.split("-").map(Number);
  const first = new Date(Date.UTC(year, monthNo - 1, 1));
  return (first.getUTCDay() + 6) % 7;
}
```

- [ ] **Step 4: 运行测试，确认通过**

```bash
npx vitest run src/lib/domain/beijing-date.test.ts
npm run typecheck
```

Expected: 全部 PASS，typecheck 无错误。

- [ ] **Step 5: 提交**

```bash
git add src/lib/domain/beijing-date.ts src/lib/domain/beijing-date.test.ts
git commit -m "feat(v04): add Beijing date/time helpers"
```

---

## Task 2: `star_ledger` 表

**Files:**
- Modify: `src/lib/db.ts`（在 `db.exec` 内、`app_settings` 之后）
- Test: `src/lib/db.test.ts`（新增 describe）

- [ ] **Step 1: 写失败测试**

在 `src/lib/db.test.ts` 末尾追加：

```ts
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
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
npx vitest run src/lib/db.test.ts
```

Expected: FAIL，`no such table: star_ledger` 或列不存在。

- [ ] **Step 3: 实现建表**

在 `src/lib/db.ts` 的 `db.exec` 模板字符串里，`app_settings` 建表之后加入：

```sql
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
```

- [ ] **Step 4: 运行测试**

```bash
npx vitest run src/lib/db.test.ts
npm run typecheck
```

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/lib/db.ts src/lib/db.test.ts
git commit -m "feat(v04): add star ledger table"
```

---

## Task 3: 账本核心逻辑

**Files:**
- Create: `src/lib/domain/star-ledger.ts`
- Test: `src/lib/domain/star-ledger.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it } from "vitest";
import { setupDb } from "@/lib/testing/auth-test-utils";
import {
  awardRunIfComplete,
  latestAwardedRunStars,
  runStats,
  totalStars,
  weeklyRunsFor,
} from "./star-ledger";

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
    const db = setupDb("ra-ledger");
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
    const db = setupDb("ra-ledger");
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
    const db = setupDb("ra-ledger");
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
    const db = setupDb("ra-ledger");
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
    const db = setupDb("ra-ledger");
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
      completedAt: "2026-11-05 01:02:00",
    });
    expect(second.stars).toBe(5);
    const rows = ledgerRows(db);
    expect(rows).toHaveLength(1);
    expect(rows[0].stars).toBe(5);
    expect(rows[0].occurred_on).toBe("2026-11-05");
  });

  it("同一内容第 4 次完整练习被限次，不写账本", () => {
    const db = setupDb("ra-ledger");
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
    const db = setupDb("ra-ledger");
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
    const db = setupDb("ra-ledger");
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
    expect(totalStars(db, "acct-a")).toBe(93);
  });

  it("账号隔离", () => {
    const db = setupDb("ra-ledger");
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
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
npx vitest run src/lib/domain/star-ledger.test.ts
```

Expected: FAIL，`Cannot find module './star-ledger'`。

- [ ] **Step 3: 实现**

```ts
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
```

- [ ] **Step 4: 运行测试**

```bash
npx vitest run src/lib/domain/star-ledger.test.ts
npm run typecheck
```

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/lib/domain/star-ledger.ts src/lib/domain/star-ledger.test.ts
git commit -m "feat(v04): implement star ledger award and weekly cap"
```

---

## Task 4: 成长页读侧聚合

**Files:**
- Create: `src/lib/domain/growth.ts`
- Test: `src/lib/domain/growth.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it } from "vitest";
import { setupDb } from "@/lib/testing/auth-test-utils";
import { growthSnapshot } from "./growth";

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
    const db = setupDb("ra-growth");
    ledger(db, {
      kind: "baseline",
      stars: 95,
      occurredOn: "2026-11-01",
      createdAt: "2026-11-05 01:00:00",
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
    const db = setupDb("ra-growth");
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
    const db = setupDb("ra-growth");
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
    const db = setupDb("ra-growth");
    ledger(db, {
      stars: 10,
      occurredOn: "2026-11-03",
      weekStart: "2026-11-02",
    });
    ledger(db, {
      stars: 10,
      occurredOn: "2026-11-04",
      weekStart: "2026-11-02",
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
    const db = setupDb("ra-growth");
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
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
npx vitest run src/lib/domain/growth.test.ts
```

Expected: FAIL，`Cannot find module './growth'`。

- [ ] **Step 3: 实现**

```ts
import type { Db } from "../db";
import {
  beijingDateOf,
  beijingMonthOf,
  beijingToday,
  daysInMonth,
  monthDates,
  shiftDate,
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

  const attemptRows = db
    .prepare(
      `SELECT DISTINCT date(created_at, '+8 hours') AS date
       FROM practice_attempts
       WHERE owner = ? AND date(created_at, '+8 hours') BETWEEN ? AND ?`
    )
    .all(accountId, monthStart, monthEnd) as Array<{ date: string }>;
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
```

- [ ] **Step 4: 运行测试**

```bash
npx vitest run src/lib/domain/growth.test.ts
npm run typecheck
```

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/lib/domain/growth.ts src/lib/domain/growth.test.ts
git commit -m "feat(v04): add growth snapshot aggregation"
```

---

## Task 5: 初始星星回填

**Files:**
- Create: `src/lib/domain/baseline.ts`
- Test: `src/lib/domain/baseline.test.ts`
- Create: `scripts/backfill-baseline-stars.ts`
- Modify: `package.json`、`scripts/deploy.sh`、`docs/deploy.md`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it } from "vitest";
import { setupDb } from "@/lib/testing/auth-test-utils";
import { backfillBaselineStars } from "./baseline";

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
    const db = setupDb("ra-baseline");
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
    const db = setupDb("ra-baseline");
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
    const db = setupDb("ra-baseline");
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
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
npx vitest run src/lib/domain/baseline.test.ts
```

Expected: FAIL，`Cannot find module './baseline'`。

- [ ] **Step 3: 实现**

```ts
import type { Db } from "../db";

export interface BaselineResult {
  accountId: string;
  unitId: string;
  stars: number;
  inserted: boolean;
}

/**
 * V0.4 上线时一次性把「每个内容的历史最好星」折算成初始星星。
 * - NULL owner 并入管理员：按 effectiveOwner 重新取每句最高星，不能简单相加。
 * - 只写 baseline 行，不写 run 行、不补打卡。
 * - 幂等：唯一索引 (account_id, unit_id) WHERE kind='baseline'。
 */
export function backfillBaselineStars(
  db: Db,
  options: { launchMonth: string; adminAccountId?: string | null }
): BaselineResult[] {
  const adminId =
    options.adminAccountId ??
    (
      db
        .prepare(
          `SELECT id FROM accounts WHERE is_admin = 1 ORDER BY created_at LIMIT 1`
        )
        .get() as { id: string } | undefined
    )?.id ??
    null;

  const raw = db
    .prepare(
      `SELECT owner, unit_id, sentence_index, MAX(stars) AS stars
       FROM practice_attempts
       GROUP BY owner, unit_id, sentence_index`
    )
    .all() as Array<{
    owner: string | null;
    unit_id: string;
    sentence_index: number;
    stars: number;
  }>;

  const bestBySentence = new Map<string, number>();
  for (const row of raw) {
    const effectiveOwner = row.owner ?? adminId;
    if (!effectiveOwner) continue;
    const key = `${effectiveOwner}\u0000${row.unit_id}\u0000${row.sentence_index}`;
    bestBySentence.set(
      key,
      Math.max(bestBySentence.get(key) ?? 0, row.stars)
    );
  }

  const totals = new Map<string, { accountId: string; unitId: string; stars: number }>();
  for (const [key, stars] of bestBySentence) {
    const [accountId, unitId] = key.split("\u0000");
    const totalKey = `${accountId}\u0000${unitId}`;
    const current = totals.get(totalKey) ?? { accountId, unitId, stars: 0 };
    current.stars += stars;
    totals.set(totalKey, current);
  }

  const occurredOn = `${options.launchMonth}-01`;
  const insert = db.prepare(
    `INSERT OR IGNORE INTO star_ledger
       (account_id, kind, unit_id, run_id, stars, base_stars, doubled, occurred_on, week_start)
     VALUES (?, 'baseline', ?, NULL, ?, ?, 0, ?, NULL)`
  );

  const results: BaselineResult[] = [];
  const tx = db.transaction(() => {
    for (const item of totals.values()) {
      const info = insert.run(
        item.accountId,
        item.unitId,
        item.stars,
        item.stars,
        occurredOn
      );
      results.push({
        accountId: item.accountId,
        unitId: item.unitId,
        stars: item.stars,
        inserted: info.changes > 0,
      });
    }
  });
  tx();
  return results.sort((a, b) =>
    `${a.accountId}/${a.unitId}`.localeCompare(`${b.accountId}/${b.unitId}`)
  );
}
```

- [ ] **Step 4: 运行测试**

```bash
npx vitest run src/lib/domain/baseline.test.ts
npm run typecheck
```

Expected: PASS。

- [ ] **Step 5: 回填脚本**

```ts
// 一次性把历史练习折算成初始星星；幂等，部署时可重复执行。
import { openDb, dbPath } from "../src/lib/db";
import { beijingMonthOf, beijingToday } from "../src/lib/domain/beijing-date";
import { backfillBaselineStars } from "../src/lib/domain/baseline";

const db = openDb(dbPath());
try {
  const launchMonth = beijingMonthOf(beijingToday());
  const rows = backfillBaselineStars(db, { launchMonth });
  const inserted = rows.filter((row) => row.inserted);
  console.log(`[baseline] launchMonth=${launchMonth}`);
  for (const row of inserted) {
    console.log(`[baseline] ${row.accountId} / ${row.unitId}: +${row.stars}`);
  }
  console.log(`[baseline] inserted ${inserted.length} rows`);
} finally {
  db.close();
}
```

- [ ] **Step 6: 接线 package.json / deploy.sh / deploy.md**

`package.json` 的 `scripts` 增加：

```json
"backfill:stars": "tsx scripts/backfill-baseline-stars.ts"
```

`scripts/deploy.sh` 在 `npm run build` 之后、`pm2 reload` 之前插入：

```bash
echo "==> 回填初始星星（幂等）"
ssh "$HOST" "cd '$APP_DIR' && npm run backfill:stars"
```

`docs/deploy.md` 增加：

```markdown
## V0.4 初始星星回填

部署脚本会在构建后、重启前执行 `npm run backfill:stars`。也可以手动执行：

```bash
ssh <user@host> "cd /opt/english-readalong && npm run backfill:stars"
```

输出会列出本次新增的 `账号 / 内容: +星星`。重复执行不会重复插入。
```

- [ ] **Step 7: 提交**

```bash
git add src/lib/domain/baseline.ts src/lib/domain/baseline.test.ts scripts/backfill-baseline-stars.ts package.json scripts/deploy.sh docs/deploy.md
git commit -m "feat(v04): add baseline star backfill"
```

---

## Task 6: `GET /api/growth`

**Files:**
- Create: `src/app/api/growth/route.ts`
- Test: `src/app/api/growth/route.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { afterEach, describe, expect, it } from "vitest";
import { GET } from "./route";
import { setupDb, authedGet } from "@/lib/testing/auth-test-utils";
import { beijingMonthOf, beijingToday, beijingWeekStart, monthRange } from "@/lib/domain/beijing-date";

afterEach(() => {
  delete process.env.DB_PATH;
});

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
    const { sessionCookieFor } = await import("@/lib/testing/auth-test-utils");
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
    expect(body.days.some((d: { checkedIn: boolean }) => d.checkedIn)).toBe(true);
    expect(body.balances.length).toBeGreaterThan(0);
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
    expect(res.status).not.toBe(400); // 最早一个月仍允许
    const older = monthRange(current, 12)[12];
    const res2 = await get(older);
    expect(res2.status).toBe(400);
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
npx vitest run src/app/api/growth/route.test.ts
```

Expected: FAIL，`Cannot find module './route'`。

- [ ] **Step 3: 实现**

```ts
import { NextResponse } from "next/server";
import { requireAccount } from "@/lib/auth/guard";
import { openDb, dbPath } from "@/lib/db";
import { growthSnapshot } from "@/lib/domain/growth";
import {
  beijingMonthOf,
  beijingToday,
  isValidMonth,
  monthRange,
} from "@/lib/domain/beijing-date";
import { errorResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const auth = requireAccount(req);
  if (!auth.ok) return auth.response;

  const current = beijingMonthOf(beijingToday());
  const raw = new URL(req.url).searchParams.get("month") ?? current;
  if (!isValidMonth(raw) || !monthRange(current, 11).includes(raw)) {
    return errorResponse(400, "INVALID_MONTH", "只能查看最近 12 个月");
  }

  const db = openDb(dbPath());
  try {
    return NextResponse.json(growthSnapshot(db, auth.account.id, raw));
  } finally {
    db.close();
  }
}
```

- [ ] **Step 4: 运行测试**

```bash
npx vitest run src/app/api/growth/route.test.ts
npm run typecheck
```

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/app/api/growth/route.ts src/app/api/growth/route.test.ts
git commit -m "feat(v04): add growth API"
```

---

## Task 7: 内容接口接入 `weeklyRuns` 与账本入账星

**Files:**
- Modify: `src/lib/content/view.ts`
- Modify: `src/lib/owned-content.ts`
- Modify: `src/app/api/drafts/route.ts`
- Modify: `src/lib/domain/stats.ts`（删除 `latestRunStars`）
- Modify: `src/lib/domain/stats.test.ts`（删除对应 describe）
- Modify: `src/app/api/units/route.test.ts`
- Modify: `src/app/api/drafts/route.test.ts`

- [ ] **Step 1: 写失败测试**

在 `src/app/api/units/route.test.ts` 的 `latestRunStars` describe 替换为（并在文件顶部 import `beijingToday, beijingWeekStart`）：

```ts
describe("内容星数与本周次数（V0.4 账本口径）", () => {
  function insertRun(
    owner: string,
    stars: number,
    occurredOn: string,
    runId: string,
    unitId = "u2-dragon-dance"
  ): void {
    const db = openDb(process.env.DB_PATH!);
    try {
      db.prepare(
        `INSERT INTO star_ledger
           (account_id, kind, unit_id, run_id, stars, base_stars, doubled, occurred_on, week_start, created_at)
         VALUES (?, 'run', ?, ?, ?, ?, 0, ?, ?, '2026-11-05 01:00:00')`
      ).run(
        owner,
        unitId,
        runId,
        stars,
        stars,
        occurredOn,
        beijingWeekStart(occurredOn)
      );
    } finally {
      db.close();
    }
  }

  it("没有完整练习时 latestRunStars 为 null", async () => {
    setupEnv();
    const res = await GET(authedGet("http://x/api/units"));
    const body = await res.json();
    expect(body.units[0].latestRunStars).toBeNull();
    expect(body.units[0].weeklyRuns).toBe(0);
  });

  it("最近一次完整练习入账星按发生日期取最新", async () => {
    setupEnv();
    const owner = accountIdOf("parent@test.com");
    const today = beijingToday();
    insertRun(owner, 6, today, "run-a");
    insertRun(owner, 2, today, "run-b");
    const res = await GET(authedGet("http://x/api/units"));
    const body = await res.json();
    expect(body.units[0].latestRunStars).toBe(2);
    expect(body.units[0].weeklyRuns).toBe(2);
  });

  it("按账号隔离：他人的 run 不计入", async () => {
    setupEnv();
    const mine = accountIdOf("parent@test.com");
    const other = accountIdOf("other@test.com");
    const today = beijingToday();
    insertRun(mine, 5, today, "run-mine");
    insertRun(other, 7, today, "run-other");
    const res = await GET(authedGet("http://x/api/units"));
    const body = await res.json();
    expect(body.units[0].latestRunStars).toBe(5);
    expect(body.units[0].weeklyRuns).toBe(1);
  });
});
```

在 `src/app/api/drafts/route.test.ts` 的 `latestRunStars` describe 替换为（并在文件顶部 import `beijingToday, beijingWeekStart`）：

```ts
describe("GET /api/drafts · 账本入账星与本周次数（V0.4）", () => {
  function seedPublished(
    db: Db,
    accountId: string,
    title: string,
    sentenceCount = 2
  ): string {
    const id = seedDraft(db, accountId, title, sentenceCount);
    markDraftPublished(db, id);
    return id;
  }

  function insertRun(
    db: Db,
    owner: string,
    unitId: string,
    stars: number,
    occurredOn: string,
    runId: string
  ): void {
    db.prepare(
      `INSERT INTO star_ledger
         (account_id, kind, unit_id, run_id, stars, base_stars, doubled, occurred_on, week_start, created_at)
       VALUES (?, 'run', ?, ?, ?, ?, 0, ?, ?, '2026-11-05 01:00:00')`
    ).run(
      owner,
      unitId,
      runId,
      stars,
      stars,
      occurredOn,
      beijingWeekStart(occurredOn)
    );
  }

  it("published 行带最近完整练习入账星与本周次数", async () => {
    const db = setupEnv();
    const mine = accountIdOf("parent@test.com");
    const id = seedPublished(db, mine, "练过的");
    const today = beijingToday();
    insertRun(db, mine, id, 6, today, "run-a");
    insertRun(db, mine, id, 12, today, "run-b");

    const res = await get(sessionCookieFor("parent@test.com"));
    const body = await res.json();
    const item = body.drafts.find((d: { id: string }) => d.id === id);
    expect(item.latestRunStars).toBe(12);
    expect(item.weeklyRuns).toBe(2);
  });

  it("未发布行 weeklyRuns 为 0", async () => {
    const db = setupEnv();
    const mine = accountIdOf("parent@test.com");
    const id = seedDraft(db, mine, "未发布", 2);
    const res = await get(sessionCookieFor("parent@test.com"));
    const body = await res.json();
    const item = body.drafts.find((d: { id: string }) => d.id === id);
    expect(item.latestRunStars).toBeNull();
    expect(item.weeklyRuns).toBe(0);
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
npx vitest run src/app/api/units/route.test.ts src/app/api/drafts/route.test.ts
```

Expected: FAIL，`weeklyRuns` 为 undefined，`latestRunStars` 仍按旧算法。

- [ ] **Step 3: 实现**

`src/lib/content/view.ts`：

```ts
export interface ContentOverview {
  // ...现有字段
  latestRunStars: number | null;
  /** 当前账号本周在该内容上的完整练习次数（0–3）；仅用于入口拦截 */
  weeklyRuns: number;
}

export interface ContentDetail {
  // ...现有字段
  /** 当前账号本周在该内容上的完整练习次数（0–3） */
  weeklyRuns: number;
}
```

在 `getContentOverview` 返回对象里补 `weeklyRuns: 0`；在 `getContentDetail` 返回对象里补 `weeklyRuns: 0`。

`src/lib/owned-content.ts`：

```ts
import { beijingToday } from "@/lib/domain/beijing-date";
import {
  latestAwardedRunStars,
  weeklyRunsFor,
} from "@/lib/domain/star-ledger";

// ownedContentDetail 里，设置完 bestScore 后：
unit.weeklyRuns = weeklyRunsFor(db, accountId, unit.id, beijingToday());

// ownedContentOverview 里：
const today = beijingToday();
for (const u of units) {
  // ...
  u.latestRunStars = latestAwardedRunStars(db, accountId, pack.id);
  u.weeklyRuns = weeklyRunsFor(db, accountId, pack.id, today);
}
```

`src/app/api/drafts/route.ts`：

```ts
import { beijingToday } from "@/lib/domain/beijing-date";
import {
  latestAwardedRunStars,
  weeklyRunsFor,
} from "@/lib/domain/star-ledger";

// GET 内：
const today = beijingToday();
// ...
latestRunStars:
  d.status === "published"
    ? latestAwardedRunStars(db, auth.account.id, d.id)
    : null,
weeklyRuns:
  d.status === "published"
    ? weeklyRunsFor(db, auth.account.id, d.id, today)
    : 0,
```

`src/lib/domain/stats.ts`：删除 `latestRunStars` 函数及其 import `mapScoreToStars`（如果只被它使用；检查 `bestAttemptsBySentence`/`completionDistribution` 是否还需要）。`completionDistribution` 使用 `mapScoreToStars`，保留。

`src/lib/domain/stats.test.ts`：删除 `最新一次练习的总星数（票 04 latestRunStars）` describe 块；不再 import `latestRunStars`。

> 旧 `latestRunStars` 的 7 个行为测试由 Task 3 的 `latestAwardedRunStars` / `awardRunIfComplete` 测试等价覆盖；测试总数不减少。

- [ ] **Step 4: 运行测试**

```bash
npx vitest run src/app/api/units/route.test.ts src/app/api/drafts/route.test.ts src/lib/domain/stats.test.ts
npm run typecheck
```

Expected: PASS。如果 `view.test.ts` 或其他测试因新增字段报错，按错误提示补 `weeklyRuns: 0` 期望值。

- [ ] **Step 5: 提交**

```bash
git add src/lib/content/view.ts src/lib/owned-content.ts src/app/api/drafts/route.ts src/lib/domain/stats.ts src/lib/domain/stats.test.ts src/app/api/units/route.test.ts src/app/api/drafts/route.test.ts
git commit -m "feat(v04): expose weekly runs and ledger awarded stars"
```

---

## Task 8: 练习路由接入限次与入账

**Files:**
- Modify: `src/app/api/units/[id]/practice/route.ts`
- Modify: `src/app/api/units/[id]/practice/route.test.ts`

- [ ] **Step 1: 写失败测试**

在 practice route test 末尾追加：

```ts
describe("V0.4 星星账本与每周上限", () => {
  function ledgerRows() {
    const db = openDb(process.env.DB_PATH!);
    try {
      return db
        .prepare(
          `SELECT run_id, stars, base_stars, doubled, occurred_on, week_start
           FROM star_ledger ORDER BY id`
        )
        .all();
    } finally {
      db.close();
    }
  }

  it("完整练完 2 句：入账按每句最高星，返回 runComplete/runStars", async () => {
    setupEnv();
    setScoringService(new FakeScoringService([92, 80]));
    await post(0, fakeWav(), undefined, "u2-dragon-dance", "run-1");
    const res = await post(1, fakeWav(), undefined, "u2-dragon-dance", "run-1");
    const body = await res.json();
    expect(body).toMatchObject({
      runComplete: true,
      runStars: 5,
      runDoubled: false,
      weeklyRuns: 1,
    });
    expect(ledgerRows()).toHaveLength(1);
    expect(ledgerRows()[0]).toMatchObject({
      run_id: "run-1",
      stars: 5,
      base_stars: 5,
      doubled: 0,
    });
  });

  it("只练 1 句不入账", async () => {
    setupEnv();
    setScoringService(new FakeScoringService(92));
    const res = await post(0, fakeWav(), undefined, "u2-dragon-dance", "run-1");
    expect(await res.json()).toMatchObject({
      runComplete: false,
      runStars: null,
    });
    expect(ledgerRows()).toHaveLength(0);
  });

  it("2 句都三星时翻倍（round(2*0.9)=2）", async () => {
    setupEnv();
    setScoringService(new FakeScoringService([92, 95]));
    await post(0, fakeWav(), undefined, "u2-dragon-dance", "run-double");
    const res = await post(1, fakeWav(), undefined, "u2-dragon-dance", "run-double");
    expect(await res.json()).toMatchObject({
      runComplete: true,
      runStars: 12,
      runDoubled: true,
    });
    expect(ledgerRows()[0]).toMatchObject({ stars: 12, base_stars: 6, doubled: 1 });
  });

  it("本周第 4 次完整练习被 409 拦截，且不调用评测", async () => {
    setupEnv();
    setScoringService(new FakeScoringService(92));
    for (const runId of ["r1", "r2", "r3"]) {
      await post(0, fakeWav(), undefined, "u2-dragon-dance", runId);
      await post(1, fakeWav(), undefined, "u2-dragon-dance", runId);
    }
    // 第 4 次若调用评测会因空队列返回 502；409 证明限次在评分前
    setScoringService(new FakeScoringService([]));
    const res = await post(0, fakeWav(), undefined, "u2-dragon-dance", "r4");
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("WEEKLY_LIMIT_REACHED");
    expect(attemptRows()).toHaveLength(6);
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
npx vitest run 'src/app/api/units/[id]/practice/route.test.ts'
```

Expected: FAIL，返回体没有 `runComplete`/`weeklyRuns`，第 4 次仍 200。

- [ ] **Step 3: 实现**

在 `src/app/api/units/[id]/practice/route.ts` 中：

1) 顶部 import：

```ts
import { beijingToday } from "@/lib/domain/beijing-date";
import { awardRunIfComplete, weeklyRunsFor } from "@/lib/domain/star-ledger";
```

2) 在内容包/可见性校验之后、构造评测服务之前加限次检查：

```ts
  const capDb = openDb(dbPath());
  try {
    if (weeklyRunsFor(capDb, auth.account.id, id, beijingToday()) >= 3) {
      return errorResponse(
        409,
        "WEEKLY_LIMIT_REACHED",
        "这个内容本周已经挑战 3 次啦，下周再来挑战，先试试其他内容吧！"
      );
    }
  } finally {
    capDb.close();
  }
```

3) 把原来的落库块替换为事务：

```ts
  const db = openDb(dbPath());
  try {
    const tx = db.transaction(() => {
      const prev =
        bestAttemptsBySentence(db, id, { owner: auth.account.id }).get(
          sentenceIndex
        )?.score ?? null;
      const isNewBest = prev === null || score > prev;
      const info = db
        .prepare(
          "INSERT INTO practice_attempts (unit_id, sentence_index, score, stars, owner, run_id) VALUES (?, ?, ?, ?, ?, ?)"
        )
        .run(id, sentenceIndex, score, stars, auth.account.id, runId);
      const inserted = db
        .prepare("SELECT created_at FROM practice_attempts WHERE id = ?")
        .get(info.lastInsertRowid) as { created_at: string };
      const award = runId
        ? awardRunIfComplete(db, {
            accountId: auth.account.id,
            unitId: id,
            runId,
            sentenceCount: pack.sentences.length,
            completedAt: inserted.created_at,
          })
        : {
            complete: false,
            stars: null,
            baseStars: null,
            doubled: false,
            weeklyRuns: weeklyRunsFor(
              db,
              auth.account.id,
              id,
              beijingToday()
            ),
            weeklyLimitReached: false,
          };
      return { prev, isNewBest, award };
    });

    const { prev, isNewBest, award } = tx();
    return NextResponse.json({
      score,
      stars,
      isNewBest,
      bestScore: Math.max(score, prev ?? score),
      runComplete: award.complete,
      runStars: award.stars,
      runDoubled: award.doubled,
      weeklyRuns: award.weeklyRuns,
      weeklyLimitReached: award.weeklyLimitReached,
    });
  } finally {
    db.close();
  }
```

- [ ] **Step 4: 运行测试**

```bash
npx vitest run 'src/app/api/units/[id]/practice/route.test.ts'
npm run typecheck
```

Expected: PASS。旧测试的响应字段仍然兼容（只多不少）。

- [ ] **Step 5: 提交**

```bash
git add 'src/app/api/units/[id]/practice/route.ts' 'src/app/api/units/[id]/practice/route.test.ts'
git commit -m "feat(v04): award stars on complete runs and enforce weekly cap"
```

---

## Task 9: 站内弹窗组件

**Files:**
- Create: `src/components/shared/Modal.tsx`
- Create: `src/components/shared/WeeklyLimitModal.tsx`

UI 走手工验收（仓库约定页面不做自动化测试）。

- [ ] **Step 1: 实现 Modal**

```tsx
"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function Modal({
  open,
  onClose,
  title,
  children,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  primaryLabel?: string;
  onPrimary?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}) {
  const titleId = useId();
  const cardRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !cardRef.current) return;
      const focusable = cardRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    cardRef.current
      ?.querySelector<HTMLElement>("button")
      ?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-5 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={onClose}
    >
      <div
        ref={cardRef}
        className="relative w-full max-w-md rounded-3xl bg-white p-8 text-center shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full text-lg text-slate-400 active:bg-slate-50"
          aria-label="关闭"
        >
          ✕
        </button>
        <h2 id={titleId} className="mt-2 text-2xl font-extrabold text-slate-800">
          {title}
        </h2>
        {children}
        <div className="mt-7 grid gap-3">
          {primaryLabel && onPrimary && (
            <button
              type="button"
              onClick={onPrimary}
              className="rounded-2xl bg-emerald-500 px-5 py-3.5 text-lg font-bold text-white shadow-sm active:bg-emerald-600"
            >
              {primaryLabel}
            </button>
          )}
          {secondaryLabel && onSecondary && (
            <button
              type="button"
              onClick={onSecondary}
              className="rounded-2xl px-5 py-3 text-base font-semibold text-slate-500 ring-1 ring-slate-200 active:bg-slate-50"
            >
              {secondaryLabel}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
```

- [ ] **Step 2: 实现 WeeklyLimitModal**

```tsx
"use client";

import { useRouter } from "next/navigation";
import { Modal } from "./Modal";

export function WeeklyLimitModal({
  open,
  onClose,
  contentType,
}: {
  open: boolean;
  onClose: () => void;
  contentType: "standard" | "custom";
}) {
  const router = useRouter();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="本周挑战次数用完啦"
      primaryLabel="去练其他内容"
      onPrimary={() => {
        onClose();
        router.push(contentType === "standard" ? "/units" : "/custom");
      }}
      secondaryLabel="知道了"
      onSecondary={onClose}
    >
      <div className="mx-auto mt-4 flex h-20 w-20 items-center justify-center rounded-full bg-amber-100 text-4xl">
        🌟
      </div>
      <p className="mt-4 text-lg leading-relaxed text-slate-600">
        这个内容本周已经挑战 3 次啦，下周再来挑战，先试试其他内容吧！
      </p>
      <p className="mt-4 text-xs text-slate-400">下周一自动重置</p>
    </Modal>
  );
}
```

- [ ] **Step 3: 手工验证**

启动开发服务器：

```bash
npm run dev
```

在任一页面临时渲染 `<WeeklyLimitModal open onClose={() => {}} contentType="standard" />`，确认：
- 背景模糊、卡片居中；
- Esc、背景点击、✕ 都能关闭；
- Tab 在按钮间循环；
- 视觉与原型 A 的弹窗一致。

验证完删除临时入口。

- [ ] **Step 4: 提交**

```bash
git add src/components/shared/Modal.tsx src/components/shared/WeeklyLimitModal.tsx
git commit -m "feat(v04): add in-app modal and weekly limit prompt"
```

---

## Task 10: 路由与侧边栏

**Files:**
- Move: `src/app/(shell)/page.tsx` → `src/app/(shell)/units/page.tsx`
- Move: `src/app/(shell)/home-grid.ts` → `src/app/(shell)/units/home-grid.ts`
- Move: `src/app/(shell)/home-grid.test.ts` → `src/app/(shell)/units/home-grid.test.ts`
- Modify: `src/app/(shell)/layout.tsx`
- Modify: `src/components/shell/Sidebar.tsx`
- Create: `src/app/(shell)/page.tsx`（成长页，先渲染占位，Task 12 替换）

- [ ] **Step 1: 移动教材列表**

```bash
mkdir -p 'src/app/(shell)/units'
git mv 'src/app/(shell)/page.tsx' 'src/app/(shell)/units/page.tsx'
git mv 'src/app/(shell)/home-grid.ts' 'src/app/(shell)/units/home-grid.ts'
git mv 'src/app/(shell)/home-grid.test.ts' 'src/app/(shell)/units/home-grid.test.ts'
```

检查 `units/page.tsx` 内 `./home-grid` 相对导入仍成立；`ContentCard` 的 `href={`/units/${unit.id}`}` 不变。

- [ ] **Step 2: 新建成长页占位**

```tsx
export default function GrowthPage() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="text-3xl font-extrabold tracking-tight">我的成长</h1>
      <p className="mt-2 text-slate-500">正在加载成长数据…</p>
    </div>
  );
}
```

- [ ] **Step 3: 侧边栏**

`src/components/shell/Sidebar.tsx`：

```tsx
const GROWTH_ITEM: NavItem = { href: "/", label: "我的成长", exact: true };
const STANDARD_ITEM: NavItem = { href: "/units", label: "教材内容", exact: false };
const CUSTOM_ITEM: NavItem = { href: "/custom", label: "自定义内容", exact: false };
const ADMIN_ITEM: NavItem = { href: "/admin", label: "管理", exact: false };

const items = [
  GROWTH_ITEM,
  ...(showStandard ? [STANDARD_ITEM] : []),
  CUSTOM_ITEM,
  ...(isAdmin ? [ADMIN_ITEM] : []),
];
```

- [ ] **Step 4: 删除 `/` → `/custom` 重定向**

`src/app/(shell)/layout.tsx` 删除：

```tsx
  const redirectHome =
    account != null && !account.standardContentVisible && pathname === "/";
  useEffect(() => {
    if (redirectHome) router.replace("/custom");
  }, [redirectHome, router]);
```

并删除 `if (!account || redirectHome)` 里的 `|| redirectHome`；删除 `usePathname` import（如果不再使用）。

- [ ] **Step 5: 检查链接**

```bash
grep -rn 'href="/"' src/app src/components
```

Expected: 只有 `src/app/login/page.tsx` 的 `router.replace("/")`（登录后落成长页）。其他把 `/` 当教材列表的链接改为 `/units`。

- [ ] **Step 6: 运行检查**

```bash
npm run typecheck
npm run build
```

Expected: 通过。`/` 显示占位成长页，`/units` 显示教材列表。

- [ ] **Step 7: 提交**

```bash
git add 'src/app/(shell)'
git commit -m "feat(v04): move standard list to /units and add growth landing route"
```

---

## Task 11: 成长页 UI（A 方案）

**Files:**
- Create: `src/components/growth/types.ts`
- Create: `src/components/growth/MonthSwitcher.tsx`
- Create: `src/components/growth/Calendar.tsx`
- Create: `src/components/growth/BalanceCurve.tsx`
- Create: `src/components/growth/GrowthView.tsx`
- Modify: `src/app/(shell)/page.tsx`

- [ ] **Step 1: 确认月历纯函数已覆盖**

`leadingBlanks` 已在 Task 1 的 `beijing-date.test.ts` 覆盖；`Calendar.tsx` 直接 import，不再新建 `growth-calendar.ts`。

- [ ] **Step 2: 客户端类型**

```ts
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
```

- [ ] **Step 3: MonthSwitcher**

```tsx
"use client";

import { monthLabel, shiftMonth } from "@/lib/domain/beijing-date";

export function MonthSwitcher({
  month,
  earliest,
  current,
  onChange,
}: {
  month: string;
  earliest: string;
  current: string;
  onChange: (month: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onChange(shiftMonth(month, -1))}
        disabled={month <= earliest}
        aria-label="上个月"
        className="flex h-9 w-9 items-center justify-center rounded-full text-xl font-bold text-slate-500 ring-1 ring-slate-200 disabled:opacity-30"
      >
        ‹
      </button>
      <span className="min-w-[108px] text-center font-extrabold text-slate-700">
        {monthLabel(month)}
      </span>
      <button
        type="button"
        onClick={() => onChange(shiftMonth(month, 1))}
        disabled={month >= current}
        aria-label="下个月"
        className="flex h-9 w-9 items-center justify-center rounded-full text-xl font-bold text-slate-500 ring-1 ring-slate-200 disabled:opacity-30"
      >
        ›
      </button>
    </div>
  );
}
```

`beijing-date.ts` 需要补一个 `monthLabel`：

```ts
export function monthLabel(month: string): string {
  const [year, monthNo] = month.split("-").map(Number);
  return `${year}年${monthNo}月`;
}
```

补对应测试。

- [ ] **Step 4: Calendar**

```tsx
"use client";

import {
  beijingToday,
  leadingBlanks,
  monthDates,
} from "@/lib/domain/beijing-date";
import type { GrowthDay } from "./types";

const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];

export function Calendar({
  month,
  days,
}: {
  month: string;
  days: GrowthDay[];
}) {
  const today = beijingToday();
  const byDate = new Map(days.map((day) => [day.date, day]));
  const blanks = leadingBlanks(month);
  return (
    <div>
      <div className="mt-3 grid grid-cols-7 gap-1.5">
        {WEEKDAYS.map((day) => (
          <div
            key={day}
            className="pb-1 text-center text-[11px] font-bold text-slate-400"
          >
            {day}
          </div>
        ))}
        {Array.from({ length: blanks }).map((_, index) => (
          <div key={`blank-${index}`} />
        ))}
        {monthDates(month).map((date) => {
          const day = byDate.get(date);
          const isToday = date === today;
          return (
            <div
              key={date}
              className={`relative min-h-[70px] rounded-2xl p-1.5 ring-1 ${
                day?.checkedIn
                  ? "bg-amber-50 ring-amber-100"
                  : day?.partial
                    ? "bg-slate-50 ring-slate-100"
                    : "bg-white ring-slate-100"
              } ${isToday ? "ring-2 ring-emerald-400" : ""}`}
            >
              <div className="flex items-start justify-between">
                <span
                  className={`text-xs font-semibold ${
                    day?.checkedIn || day?.partial
                      ? "text-slate-700"
                      : "text-slate-300"
                  }`}
                >
                  {Number(date.slice(8, 10))}
                </span>
                {day?.checkedIn && (
                  <span className="text-[10px] font-bold text-emerald-500">
                    ✓
                  </span>
                )}
              </div>
              {day?.checkedIn && (
                <div className="absolute inset-x-1 bottom-1.5 text-center text-sm font-extrabold leading-none text-amber-600">
                  🌟{day.stars}
                </div>
              )}
              {day?.partial && (
                <div className="absolute inset-x-0 bottom-2 flex justify-center">
                  <span className="h-2 w-2 rounded-full bg-amber-300 ring-2 ring-amber-100" />
                </div>
              )}
              {isToday && (
                <span className="absolute bottom-0.5 left-1 text-[8px] font-bold text-emerald-600">
                  今天
                </span>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-4 text-[11px] text-slate-400">
        <span className="flex items-center gap-1">
          <span className="font-bold text-emerald-500">✓</span>完成打卡
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-amber-300" />
          练习过 · 未完成整条内容
        </span>
        <span className="flex items-center gap-1">🌟 当天获得星星</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: BalanceCurve**

```tsx
"use client";

import type { GrowthBalance } from "./types";

export function BalanceCurve({
  balances,
  checkInDates,
}: {
  balances: GrowthBalance[];
  checkInDates: string[];
}) {
  const width = 720;
  const height = 240;
  const pad = { left: 48, right: 18, top: 18, bottom: 30 };
  const max = Math.max(...balances.map((item) => item.balance), 1);
  const niceMax = Math.ceil(max / 100) * 100;
  const innerWidth = width - pad.left - pad.right;
  const innerHeight = height - pad.top - pad.bottom;
  const x = (index: number) =>
    pad.left + (index / Math.max(balances.length - 1, 1)) * innerWidth;
  const y = (value: number) =>
    pad.top + innerHeight - (value / niceMax) * innerHeight;
  const line = balances
    .map(
      (item, index) =>
        `${index === 0 ? "M" : "L"}${x(index).toFixed(1)},${y(
          item.balance
        ).toFixed(1)}`
    )
    .join(" ");
  const area = `${line} L${x(balances.length - 1).toFixed(1)},${
    pad.top + innerHeight
  } L${pad.left},${pad.top + innerHeight} Z`;
  const checkSet = new Set(checkInDates);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((ratio) =>
    Math.round(niceMax * ratio)
  );

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="mt-2 w-full"
      role="img"
      aria-label="当月星星余额曲线"
    >
      <defs>
        <linearGradient id="growth-curve-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#10b981" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#10b981" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {ticks.map((value) => (
        <g key={value}>
          <line
            x1={pad.left}
            x2={width - pad.right}
            y1={y(value)}
            y2={y(value)}
            stroke="#e2e8f0"
            strokeDasharray={value === 0 ? "0" : "4 6"}
          />
          <text
            x={pad.left - 10}
            y={y(value) + 4}
            textAnchor="end"
            className="fill-slate-400"
            fontSize="11"
          >
            {value}
          </text>
        </g>
      ))}
      <path d={area} fill="url(#growth-curve-fill)" />
      <path
        d={line}
        fill="none"
        stroke="#10b981"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {balances.map((item, index) =>
        checkSet.has(item.date) ? (
          <circle
            key={item.date}
            cx={x(index)}
            cy={y(item.balance)}
            r="4"
            fill="white"
            stroke="#10b981"
            strokeWidth="2.5"
          />
        ) : null
      )}
      {[1, 5, 10, 15, 20, 25, 30]
        .filter((day) => day <= balances.length)
        .map((day) => (
          <text
            key={day}
            x={x(day - 1)}
            y={height - 8}
            textAnchor="middle"
            className="fill-slate-400"
            fontSize="11"
          >
            {day}
          </text>
        ))}
    </svg>
  );
}
```

- [ ] **Step 6: GrowthView**

```tsx
"use client";

import { useEffect, useState } from "react";
import {
  beijingMonthOf,
  beijingToday,
  monthLabel,
  shiftMonth,
} from "@/lib/domain/beijing-date";
import { BalanceCurve } from "./BalanceCurve";
import { Calendar } from "./Calendar";
import { MonthSwitcher } from "./MonthSwitcher";
import type { GrowthSnapshot } from "./types";

export function GrowthView() {
  const currentMonth = beijingMonthOf(beijingToday());
  const earliest = shiftMonth(currentMonth, -11);
  const [month, setMonth] = useState(currentMonth);
  const [snapshot, setSnapshot] = useState<GrowthSnapshot | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    (async () => {
      try {
        const res = await fetch(`/api/growth?month=${month}`);
        if (cancelled) return;
        if (!res.ok) {
          setFailed(true);
          return;
        }
        setSnapshot((await res.json()) as GrowthSnapshot);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [month]);

  if (failed) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-8">
        <h1 className="text-3xl font-extrabold tracking-tight">我的成长</h1>
        <p className="mt-8 text-lg text-slate-400" role="alert">
          加载失败，请刷新重试
        </p>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-8">
        <h1 className="text-3xl font-extrabold tracking-tight">我的成长</h1>
        <p className="mt-8 text-lg text-slate-400" role="status">
          加载中…
        </p>
      </div>
    );
  }

  const checkInDates = snapshot.days
    .filter((day) => day.checkedIn)
    .map((day) => day.date);
  const launchMonthStart = `${snapshot.launchMonth}-01`;
  const showLaunchDateNote =
    snapshot.month === snapshot.launchMonth &&
    snapshot.launchDate !== launchMonthStart;
  const endLabel = snapshot.isCurrentMonth ? "现在" : "月末";
  const endBalance =
    snapshot.balances[snapshot.balances.length - 1]?.balance ?? snapshot.totalStars;

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">我的成长</h1>
          <p className="mt-1 text-slate-500">
            每一次跟读，都会变成一颗小星星。
          </p>
        </div>
        <MonthSwitcher
          month={month}
          earliest={earliest}
          current={currentMonth}
          onChange={setMonth}
        />
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-3xl bg-gradient-to-br from-amber-100 to-amber-50 p-5 shadow-sm ring-1 ring-amber-100">
          <div className="text-xs font-bold text-slate-500">累计星星</div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-4xl font-black text-amber-600">
              {snapshot.totalStars}
            </span>
            <span className="text-sm font-bold text-slate-400">🌟</span>
          </div>
        </div>
        <div className="rounded-3xl bg-gradient-to-br from-emerald-50 to-white p-5 shadow-sm ring-1 ring-emerald-100">
          <div className="text-xs font-bold text-slate-500">连续打卡</div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-4xl font-black text-emerald-600">
              {snapshot.streakDays}
            </span>
            <span className="text-sm font-bold text-slate-400">天 🔥</span>
          </div>
        </div>
        <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
          <div className="text-xs font-bold text-slate-500">本月获得</div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-4xl font-black text-slate-700">
              {snapshot.monthStars}
            </span>
            <span className="text-sm font-bold text-slate-400">🌟</span>
          </div>
        </div>
      </div>

      <div
        className={`mt-6 grid gap-6 ${
          snapshot.preLaunch ? "" : "xl:grid-cols-[1.35fr_1fr]"
        }`}
      >
        <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-extrabold">打卡日历</h2>
              <p className="mt-0.5 text-xs text-slate-400">
                完成一条完整内容，就会点亮一天
              </p>
            </div>
            <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-bold text-sky-600">
              {snapshot.monthStars} 🌟
            </span>
          </div>
          {snapshot.preLaunch && (
            <div className="mt-3 rounded-2xl bg-slate-50 p-5 text-center ring-1 ring-slate-100">
              <div className="text-3xl">🌱</div>
              <p className="mt-2 text-base font-bold text-slate-600">
                打卡记录从 {monthLabel(snapshot.launchMonth)} 开始
              </p>
              <p className="mt-1 text-xs text-slate-400">
                之前的练习会折算成星星，但不补打卡记录。
              </p>
            </div>
          )}
          {showLaunchDateNote && (
            <p className="mt-3 text-xs font-semibold text-slate-400">
              打卡记录从 {snapshot.launchDate} 开始
            </p>
          )}
          <Calendar month={month} days={snapshot.days} />
          {!snapshot.preLaunch && snapshot.monthStars === 0 && (
            <p className="mt-3 text-center text-xs text-slate-400">
              这个月还没有完整练完一条内容，今天试试吧！
            </p>
          )}
        </section>

        {!snapshot.preLaunch && (
          <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <h2 className="text-lg font-extrabold">
                  {Number(month.split("-")[1])}月星星积累
                </h2>
                <p className="mt-0.5 text-xs text-slate-400">
                  每天结束时的账户星星余额
                </p>
              </div>
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-bold text-emerald-600">
                +{snapshot.monthStars} 🌟
              </span>
            </div>
            <BalanceCurve
              balances={snapshot.balances}
              checkInDates={checkInDates}
            />
            <div className="flex items-center justify-between text-sm text-slate-500">
              <span>月初 {snapshot.balances[0]?.balance ?? snapshot.totalStars}</span>
              <span>
                {endLabel} {endBalance} 🌟
              </span>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
```

`src/app/(shell)/page.tsx` 改为：

```tsx
import { GrowthView } from "@/components/growth/GrowthView";

export default function GrowthPage() {
  return <GrowthView />;
}
```

- [ ] **Step 7: 运行检查 + 手工验收**

```bash
npx vitest run src/lib/domain/beijing-date.test.ts
npm run typecheck
npm run build
npm run dev
```

手工检查（iPad 768×1024 + 桌面）：
- 三张统计卡数字正确；
- 月历打卡/未完成/空白三种状态；
- 曲线随月份切换；
- 上线前月份显示说明、无曲线；
- 月份切换限制在最近 12 个月。

- [ ] **Step 8: 提交**

```bash
git add src/components/growth 'src/app/(shell)/page.tsx'
git commit -m "feat(v04): implement My Growth page"
```

---

## Task 12: 卡片限次拦截与详情页

**Files:**
- Modify: `src/app/(shell)/units/page.tsx`
- Modify: `src/app/(shell)/custom/page.tsx`
- Modify: `src/app/(shell)/units/[id]/page.tsx`
- Modify: `src/app/(shell)/units/[id]/PracticeFlow.tsx`（仅限次拦截部分）

- [ ] **Step 1: 教材列表卡片**

`src/app/(shell)/units/page.tsx`：

1) `UnitOverview` 增加 `weeklyRuns: number;`。
2) 组件内增加：

```tsx
const [capped, setCapped] = useState<UnitOverview | null>(null);
```

3) 卡片 `<a>` 增加 onClick：

```tsx
  <a
    href={`/units/${unit.id}`}
    onClick={(event) => {
      if (unit.weeklyRuns >= 3) {
        event.preventDefault();
        setCapped(unit);
      }
    }}
    className="..."
  >
```

4) 页面末尾渲染：

```tsx
<WeeklyLimitModal
  open={capped != null}
  onClose={() => setCapped(null)}
  contentType="standard"
/>
```

5) import：

```tsx
import { WeeklyLimitModal } from "@/components/shared/WeeklyLimitModal";
```

6) 卡片星数文案：

```tsx
{unit.latestRunStars != null ? (
  <>
    <span className="text-2xl font-extrabold leading-none text-amber-500">
      🌟{unit.latestRunStars}
    </span>
    <p className="mt-0.5 text-[11px] text-slate-400">上次练完获得</p>
  </>
) : (
  <span className="text-xs font-medium text-slate-400">还没完整练过</span>
)}
```

- [ ] **Step 2: 自定义列表卡片**

`src/app/(shell)/custom/page.tsx`：

1) `DraftOverview` 增加 `weeklyRuns: number;`。
2) 组件内增加：

```tsx
const [capped, setCapped] = useState<DraftOverview | null>(null);
```

3) published 的 `<a>` 增加：

```tsx
  onClick={(event) => {
    if (draft.weeklyRuns >= 3) {
      event.preventDefault();
      setCapped(draft);
    }
  }}
```

4) 页面末尾渲染：

```tsx
<WeeklyLimitModal
  open={capped != null}
  onClose={() => setCapped(null)}
  contentType="custom"
/>
```

5) import `WeeklyLimitModal`。
6) 星数文案：

```tsx
{draft.status === "published" && draft.latestRunStars != null ? (
  <>
    <span className="block text-2xl font-extrabold leading-none text-amber-500">
      🌟{draft.latestRunStars}
    </span>
    <p className="mt-0.5 text-[11px] text-slate-400">上次练完获得</p>
  </>
) : draft.status === "published" ? (
  <span className="text-xs font-medium text-slate-400">还没完整练过</span>
) : (
  <span />
)}
```

- [ ] **Step 3: 详情页传 weeklyRuns**

`src/app/(shell)/units/[id]/page.tsx`：

```tsx
  return (
    <main className="flex h-full overflow-hidden">
      <PracticeFlow unit={unit} weeklyRuns={unit.weeklyRuns} />
    </main>
  );
```

- [ ] **Step 4: PracticeFlow 限次拦截**

`src/app/(shell)/units/[id]/PracticeFlow.tsx`：

1) props 增加：

```tsx
export default function PracticeFlow({
  unit,
  weeklyRuns = 0,
  practice = true,
  ...
}: {
  unit: UnitDetail;
  weeklyRuns?: number;
  practice?: boolean;
  ...
})
```

2) 组件内：

```tsx
const capped = practice && weeklyRuns >= 3;
const [capOpen, setCapOpen] = useState(false);
```

3) 开始按钮（`state.step === "idle" && practice`）的 onClick 改为：

```tsx
onClick={() => {
  if (capped) {
    setCapOpen(true);
    return;
  }
  dispatch({ type: "begin" });
}}
```

4) 在组件返回的根节点末尾（`</>` 之前）渲染：

```tsx
<WeeklyLimitModal
  open={capOpen}
  onClose={() => setCapOpen(false)}
  contentType={unit.type}
/>
```

5) import：

```tsx
import { WeeklyLimitModal } from "@/components/shared/WeeklyLimitModal";
```

6) 提交录音的 409 处理：在 `if (res.ok) { ... } else {` 分支里，在 401 判断之前加：

```tsx
if (res.status === 409 && body?.error?.code === "WEEKLY_LIMIT_REACHED") {
  dispatch({ type: "submitFailed" });
  setCapOpen(true);
  return;
}
```

- [ ] **Step 5: 手工验收**

```bash
npm run typecheck
npm run dev
```

- 把一个内容在本周练满 3 次（或临时往 `star_ledger` 插 3 行 run）；
- 点该内容卡片 → 弹窗，不跳转；
- 直接进详情页 → 点「开始练习」→ 弹窗；
- 卡片/详情不置灰；
- 平时不显示「本周已挑战 N/3」。

- [ ] **Step 6: 提交**

```bash
git add 'src/app/(shell)/units' 'src/app/(shell)/custom/page.tsx'
git commit -m "feat(v04): intercept capped content entries with modal"
```

---

## Task 13: 练习结束页三态

**Files:**
- Modify: `src/app/(shell)/units/[id]/PracticeFlow.tsx`

- [ ] **Step 1: 增加 run 汇总状态**

在 `PracticeFlow.tsx` 模块顶部（组件外）定义：

```tsx
interface RunSummary {
  runComplete: boolean;
  runStars: number | null;
  runDoubled: boolean;
  weeklyRuns: number;
  weeklyLimitReached: boolean;
}
```

在组件内、`runId` 附近：

```tsx
const [runSummary, setRunSummary] = useState<RunSummary | null>(null);
```

- [ ] **Step 2: 提交成功时保存服务端返回**

在 `submitRecording` 的 `if (res.ok)` 分支里，`const result = body as ...` 之后：

```tsx
setRunSummary({
  runComplete: Boolean(body?.runComplete),
  runStars:
    typeof body?.runStars === "number" ? body.runStars : null,
  runDoubled: Boolean(body?.runDoubled),
  weeklyRuns:
    typeof body?.weeklyRuns === "number" ? body.weeklyRuns : 0,
  weeklyLimitReached: Boolean(body?.weeklyLimitReached),
});
if (body?.weeklyLimitReached) setCapOpen(true);
```

- [ ] **Step 3: 再练一遍重置本轮状态**

`restartRun` 改为：

```tsx
const restartRun = () => {
  setRunId(crypto.randomUUID());
  setSessionPracticed(new Set());
  setRunSummary(null);
  dispatch({ type: "select", index: 0 });
};
```

> `localBest` 保持不清空：句格继续显示历史最高星。

- [ ] **Step 4: 替换收尾总结**

把现有 `state.step === "finished" && practice && (() => { ... })()` 整个块替换为：

```tsx
{state.step === "finished" && practice && (() => {
  const earned = unit.sentences.reduce((sum, sentence) => {
    if (!sessionPracticed.has(sentence.index) || localBest[sentence.index] == null)
      return sum;
    return sum + mapScoreToStars(localBest[sentence.index]);
  }, 0);
  const practiced = sessionPracticed.size;
  const complete = practiced === unit.sentences.length;
  const awarded = complete ? (runSummary?.runStars ?? earned) : earned;
  const doubled = complete && runSummary?.runDoubled === true;

  if (runSummary?.weeklyLimitReached) {
    return (
      <section className="mt-5 rounded-3xl bg-white p-6 text-center shadow-sm ring-1 ring-slate-100">
        <div className="text-5xl">🌟</div>
        <p className="mt-2 text-2xl font-black text-slate-700">
          本周挑战次数已用完
        </p>
        <p className="mt-2 text-base text-slate-500">
          本次不计入星星，下周再来挑战吧。
        </p>
        <button
          onClick={restartRun}
          className="mt-4 w-full rounded-2xl bg-emerald-500 py-4 text-xl font-bold text-white active:bg-emerald-600"
        >
          ↺ 再练一遍
        </button>
      </section>
    );
  }

  if (complete && doubled) {
    return (
      <section className="relative mt-5 overflow-hidden rounded-3xl bg-gradient-to-br from-amber-100 via-amber-50 to-white p-6 text-center shadow-sm ring-1 ring-amber-100">
        <span className="absolute left-5 top-5 text-2xl">✨</span>
        <span className="absolute right-6 top-8 text-xl">⭐</span>
        <span className="absolute bottom-6 left-8 text-xl">🌟</span>
        <div className="text-5xl">🎉</div>
        <p className="mt-2 text-2xl font-black text-amber-700">
          读得太棒了！
        </p>
        <p className="mt-1 text-lg font-extrabold text-amber-600">
          这次星星翻倍啦！
        </p>
        <p className="mt-3 text-5xl font-black text-amber-600">
          {awarded} <span className="text-3xl">🌟</span>
        </p>
        <p className="mt-1 text-sm font-bold text-amber-500">
          共获得 {awarded} 🌟
        </p>
        <button
          onClick={restartRun}
          className="mt-5 w-full rounded-2xl bg-emerald-500 py-4 text-xl font-bold text-white active:bg-emerald-600"
        >
          ↺ 再练一遍
        </button>
      </section>
    );
  }

  if (complete) {
    return (
      <section className="mt-5 rounded-3xl bg-emerald-50 p-6 text-center ring-1 ring-emerald-100">
        <p className="text-2xl font-bold text-emerald-700">
          🎉 整个内容练完啦！
        </p>
        <p className="mt-3 text-3xl font-bold text-amber-500">
          本次获得 {awarded} 颗星
          <span className="ml-2 text-lg font-normal text-slate-500">
            （{practiced} 句全部读完）
          </span>
        </p>
        <button
          onClick={restartRun}
          className="mt-4 w-full rounded-2xl bg-emerald-500 py-4 text-xl font-bold text-white active:bg-emerald-600"
        >
          ↺ 再练一遍
        </button>
      </section>
    );
  }

  return (
    <section className="mt-5 rounded-3xl bg-white p-6 text-center shadow-sm ring-1 ring-slate-100">
      <div className="text-5xl">🌱</div>
      <p className="mt-2 text-2xl font-black text-slate-700">
        这次还差一点点
      </p>
      <p className="mt-1 text-lg font-bold text-slate-500">
        本次读了 {practiced}/{unit.sentences.length} 句
      </p>
      <p className="mt-3 text-xl font-bold text-amber-500">
        本次句子星 {earned} 颗
      </p>
      <div className="mx-auto mt-4 max-w-md rounded-2xl bg-amber-50 px-4 py-3 text-base font-bold text-amber-700 ring-1 ring-amber-100">
        未读完所有句子，不能累计星星🌟哦！
      </div>
      <p className="mt-3 text-sm text-slate-400">
        点「再练一遍」，把剩下的句子读完就能拿到星星。
      </p>
      <button
        onClick={restartRun}
        className="mt-4 w-full rounded-2xl bg-emerald-500 py-4 text-xl font-bold text-white active:bg-emerald-600"
      >
        ↺ 再练一遍
      </button>
    </section>
  );
})()}
```

- [ ] **Step 5: 验证**

```bash
npm run typecheck
npm run test
npm run build
```

手工/测试检查：
- 句格仍显示历史最高星；即时评分卡仍显示本次星 + 最好成绩；
- 完整 + 翻倍显示 88 🌟 风格页面；
- 完整未翻倍显示「本次获得 X 颗星」；
- 跳过句子后收尾显示「未读完所有句子，不能累计星星🌟哦！」；
- 「再练一遍」清空本轮 practiced/runSummary，换新 runId。

- [ ] **Step 6: 提交**

```bash
git add 'src/app/(shell)/units/[id]/PracticeFlow.tsx'
git commit -m "feat(v04): add complete, doubled and incomplete finish states"
```

---

## Task 14: 清理、文档与全量验收

**Files:**
- Delete: `src/app/prototype/v04-growth/page.tsx`
- Modify: `docs/deploy.md`（Task 5 已加，检查措辞）
- Modify: `scripts/deploy.sh`（Task 5 已加，检查顺序）
- Modify: `.scratch/v04/spec.md` 状态（可选：从「待实现」改为「实现中」）

- [ ] **Step 1: 删除原型路由**

```bash
rm -rf src/app/prototype
```

- [ ] **Step 2: 全量测试**

```bash
npm test
npm run typecheck
npm run build
```

Expected: 全绿。若有旧测试因字段/文案变化失败，按新口径修正；不允许把业务测试删到少于改动前。

- [ ] **Step 3: 回填演练**

在本地复制一份 DB（不要动 `data/readalong.db` 原文件）：

```bash
cp data/readalong.db /tmp/readalong-v04.db
DB_PATH=/tmp/readalong-v04.db npm run backfill:stars
DB_PATH=/tmp/readalong-v04.db npm run backfill:stars
```

Expected:
- 第一次输出每个账号/内容的 baseline；
- 第二次输出 `inserted 0 rows`；
- `01f…` 约 95，管理员约 75，NULL 约 35 并入管理员；合并后按每句最高星重算。

- [ ] **Step 4: 手工验收清单**

- [ ] 登录后落到 `/`「我的成长」
- [ ] 侧边栏顺序：我的成长 → 教材内容（可见时）→ 自定义内容 → 管理（管理员）
- [ ] 教材列表在 `/units`，详情 `/units/[id]` 正常
- [ ] 成长页三卡、月历三态、图例、曲线
- [ ] 月份切换：当月、过去月、上线前月份
- [ ] 完整练习后账本入账、当天打卡、曲线更新
- [ ] 未读完不入账、不打卡、结束页标注正确
- [ ] 翻倍结束页显示正确
- [ ] 本周第 4 次被卡片/详情/服务端三层拦截
- [ ] 内容卡片显示「上次练完获得」/「还没完整练过」
- [ ] 句格最高星、即时卡本次星 + 最好成绩，无额外提示
- [ ] 教材内容可见性关闭时成长页正常、教材入口隐藏
- [ ] iPad 768×1024 + 桌面宽度
- [ ] 弹窗 Esc/背景/✕/Tab 循环
- [ ] 回填幂等

- [ ] **Step 5: 提交**

```bash
git status
# 确认只包含原型删除与本次文档/验收改动后：
git add src/app/prototype 'src/app/(shell)' src/components scripts docs package.json GLOSSARY.md .scratch/v04
git commit -m "chore(v04): remove prototype and finish acceptance"
```

---

## Self-Review

### Spec coverage

| Spec section | Plan task |
|---|---|
| 星星账本 schema | Task 2 |
| 完整练习/翻倍/每周上限 | Task 3 |
| 初始星星回填 | Task 5 |
| 打卡/连续天数/月历 | Task 4 |
| 余额曲线 | Task 4 + Task 11 |
| 我的成长页 A 方案 | Task 11 |
| 路由 `/` 与 `/units` | Task 10 |
| 内容卡片入账星 | Task 7 + Task 12 |
| 详情页/卡片限次 | Task 8 + Task 12 |
| 结束页三态 | Task 13 |
| 站内弹窗 | Task 9 |
| `GET /api/growth` | Task 6 |
| 列表/详情 `weeklyRuns` | Task 7 |
| practice 返回字段 | Task 8 |
| 北京时间 | Task 1 |
| 测试/手工验收 | 每个任务 + Task 14 |
| 不做项 | 无对应任务（按 spec） |

### Placeholder scan

本计划不含 TBD/TODO；每个代码步骤都给出可执行代码。UI 任务中的「手工验收」是仓库既有约定（页面不做自动化测试），不是占位符。

### Type consistency

- `RunAward`、`RunStats` 在 Task 3 定义，Task 8 使用同名字段。
- `GrowthSnapshot` 在 Task 4 服务端定义，Task 11 客户端 `types.ts` 保持同形。
- `weeklyRuns` 在 `ContentOverview`、`ContentDetail`、`DraftOverview` 三处同名。
- `latestAwardedRunStars` 在 Task 3 定义，Task 7 调用。
- `Modal` 的 props 在 Task 9 定义，`WeeklyLimitModal` 按该接口使用。
- `PracticeFlow` 的 `weeklyRuns` 可选，详情页传值，preview 不传。
