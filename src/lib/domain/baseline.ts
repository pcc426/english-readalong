import type { Db } from "../db";

const CUTOFF_KEY = "v04_baseline_cutoff";
const MONTH_KEY = "v04_baseline_month";

function setting(db: Db, key: string): string | null {
  const row = db
    .prepare("SELECT value FROM app_settings WHERE key = ?")
    .get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

function setSetting(db: Db, key: string, value: string): void {
  db.prepare(
    "INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)"
  ).run(key, value);
}

export interface BaselineResult {
  accountId: string;
  unitId: string;
  stars: number;
  inserted: boolean;
}

export interface BaselineReport {
  launchMonth: string;
  rows: BaselineResult[];
  skippedNullOwner: number;
}

/**
 * V0.4 上线时一次性把「每个内容的历史最好星」折算成初始星星。
 * - 只在首次执行时确定上线切点并存进 app_settings；之后的重复部署只看切点之前的练习，
 *   不会把上线后的练习再折成新的 baseline。
 * - stars 用落库时的历史快照，不按当前阈值重算——这是一次性历史折算，不是重新评分。
 * - NULL owner 并入管理员：按 effectiveOwner 重新取每句最高星，不能简单相加。
 * - 只写 baseline 行，不写 run 行、不补打卡。
 * - 幂等：唯一索引 (account_id, unit_id) WHERE kind='baseline'。
 */
export function backfillBaselineStars(
  db: Db,
  options: {
    launchMonth: string;
    adminAccountId?: string | null;
    cutoff?: string;
  }
): BaselineReport {
  const storedCutoff = setting(db, CUTOFF_KEY);
  const storedMonth = setting(db, MONTH_KEY);
  const cutoff =
    storedCutoff ??
    options.cutoff ??
    (
      db
        .prepare("SELECT datetime('now', '+1 second') AS cutoff")
        .get() as { cutoff: string }
    ).cutoff;
  const launchMonth = storedMonth ?? options.launchMonth;
  if (storedCutoff === null) {
    setSetting(db, CUTOFF_KEY, cutoff);
    setSetting(db, MONTH_KEY, launchMonth);
  }

  const adminId =
    options.adminAccountId !== undefined
      ? options.adminAccountId
      : ((
          db
            .prepare(
              "SELECT id FROM accounts WHERE is_admin = 1 ORDER BY created_at, rowid LIMIT 1"
            )
            .get() as { id: string } | undefined
        )?.id ?? null);

  const raw = db
    .prepare(
      `SELECT owner, unit_id, sentence_index, MAX(stars) AS stars
       FROM practice_attempts
       WHERE created_at < ?
       GROUP BY owner, unit_id, sentence_index`
    )
    .all(cutoff) as Array<{
    owner: string | null;
    unit_id: string;
    sentence_index: number;
    stars: number;
  }>;

  let skippedNullOwner = 0;
  const bestBySentence = new Map<string, number>();
  for (const row of raw) {
    if (row.owner === null && adminId == null) {
      skippedNullOwner += 1;
      continue;
    }
    const effectiveOwner = row.owner ?? adminId!;
    const key = `${effectiveOwner}\u0000${row.unit_id}\u0000${row.sentence_index}`;
    bestBySentence.set(
      key,
      Math.max(bestBySentence.get(key) ?? 0, row.stars)
    );
  }

  const totals = new Map<
    string,
    { accountId: string; unitId: string; stars: number }
  >();
  for (const [key, stars] of bestBySentence) {
    const [accountId, unitId] = key.split("\u0000");
    const totalKey = `${accountId}\u0000${unitId}`;
    const current = totals.get(totalKey) ?? { accountId, unitId, stars: 0 };
    current.stars += stars;
    totals.set(totalKey, current);
  }

  const occurredOn = `${launchMonth}-01`;
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
  const rows = results.sort((a, b) => {
    const aKey = `${a.accountId}/${a.unitId}`;
    const bKey = `${b.accountId}/${b.unitId}`;
    return aKey < bKey ? -1 : aKey > bKey ? 1 : 0;
  });
  return { launchMonth, rows, skippedNullOwner };
}
