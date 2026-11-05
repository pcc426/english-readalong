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
