import type { Db } from "../db";
import type { ContentPack } from "../content/schema";
import { mapScoreToStars, type BestStars } from "./stars";

export interface CompletionDistribution {
  totalSentences: number;
  /** 每句最好成绩的星级，未练为 0 */
  bestStars: BestStars[];
  percentages: {
    threeStar: number;
    twoStar: number;
    oneStar: number;
    unpracticed: number;
  };
}

export interface BestAttempt {
  score: number;
  createdAt: string;
}

/** 统计的账号维度：业务路由一律传 owner（每个家庭的进度独立，票 10）；
 * 不传为全量口径——仅供不区分账号的调用方（内容视图层）与迁移工具使用。 */
export interface StatsQuery {
  owner?: string;
}

/**
 * 每句最好成绩（含达成时间）。平手取最新一次（id 最大）。
 * 完成度统计与单元详情共用此口径，避免两处实现漂移。
 * 传 owner 时只统计该账号的记录（NULL 归属视为无本人记录）。
 */
export function bestAttemptsBySentence(
  db: Db,
  unitId: string,
  query: StatsQuery = {}
): Map<number, BestAttempt> {
  const byOwner = query.owner != null;
  const rows = db
    .prepare(
      `SELECT sentence_index, score, created_at FROM practice_attempts
       WHERE unit_id = ? ${byOwner ? "AND owner = ?" : ""} ORDER BY id`
    )
    .all(...(byOwner ? [unitId, query.owner] : [unitId])) as Array<{
    sentence_index: number;
    score: number;
    created_at: string;
  }>;
  const best = new Map<number, BestAttempt>();
  for (const row of rows) {
    const current = best.get(row.sentence_index);
    if (!current || row.score >= current.score) {
      best.set(row.sentence_index, { score: row.score, createdAt: row.created_at });
    }
  }
  return best;
}

/**
 * 最近一次练习（run）获得的总星数——教材/自定义卡片「上次练习获得 🌟N」的数据源
 * （票 04 / spec 决策 23–25）。
 *
 * - 「一次练习」= 一次 PracticeFlow 从 begin 到结束/中途退出的连续运行，
 *   轮内所有 attempt 共享一个 run_id（前端每次 mount / 再练一遍整体重开时生成新 id）。
 *   最近 run = 该账号该内容 run_id 非空的行中 id 最大者所在的 run；
 *   run 内 attempt 连续写入、id 单调递增，故包含最新一条记录的 run 即最近一次，
 *   中途退出的 run 也算最近一次。
 * - 同一 run 内同一句多次提交（「再练一次这句」）只取该 run 内最高星级计入一次，
 *   避免重读同句重复计星；星级用落库快照列（stars）。
 * - 老数据兼容：run_id 为 NULL 的行不参与「最近 run」口径（无从知道它属于哪一轮）。
 *   但有 NULL 行说明练过、不能显示「还没练过」——当该账号该内容没有任何非 NULL
 *   run 时，回退为「每句最佳星之和」（bestAttemptsBySentence 口径，与练习页句格的
 *   每句最佳展示一致），前端同样标注「上次练习获得」。
 * - 完全没有任何练习记录时返回 null（卡片才显示「还没练过」）。
 */
export function latestRunStars(
  db: Db,
  unitId: string,
  query: StatsQuery = {}
): number | null {
  const byOwner = query.owner != null;
  const ownerClause = byOwner ? "AND owner = ?" : "";
  const baseParams = byOwner ? [unitId, query.owner] : [unitId];

  const latest = db
    .prepare(
      `SELECT run_id FROM practice_attempts
       WHERE unit_id = ? ${ownerClause} AND run_id IS NOT NULL
       ORDER BY id DESC LIMIT 1`
    )
    .get(...baseParams) as { run_id: string } | undefined;

  if (latest) {
    const row = db
      .prepare(
        `SELECT COALESCE(SUM(stars), 0) AS total FROM (
           SELECT sentence_index, MAX(stars) AS stars
           FROM practice_attempts
           WHERE unit_id = ? ${ownerClause} AND run_id = ?
           GROUP BY sentence_index
         )`
      )
      .get(
        ...(byOwner
          ? [unitId, query.owner, latest.run_id]
          : [unitId, latest.run_id])
      ) as { total: number };
    return row.total;
  }

  // 回退：没有任何非 NULL run。先确认确实练过（否则是「还没练过」的 null）。
  const anyAttempt = db
    .prepare(
      `SELECT 1 FROM practice_attempts WHERE unit_id = ? ${ownerClause} LIMIT 1`
    )
    .get(...baseParams);
  if (!anyAttempt) return null;

  let total = 0;
  for (const best of bestAttemptsBySentence(db, unitId, query).values()) {
    total += mapScoreToStars(best.score);
  }
  return total;
}

/**
 * 单元完成度：每句取练习记录中的最好成绩映射为星级，
 * 百分比按全部句子数四舍五入（四类各自独立取整，合计可能 ±1%）。
 * 传 owner 时按该账号的记录计算。
 */
export function completionDistribution(
  db: Db,
  unit: ContentPack,
  query: StatsQuery = {}
): CompletionDistribution {
  const bestByIndex = bestAttemptsBySentence(db, unit.id, query);

  const bestStars: BestStars[] = unit.sentences.map((_, index) => {
    const best = bestByIndex.get(index);
    return best == null ? 0 : mapScoreToStars(best.score);
  });

  const total = unit.sentences.length;
  const count = (stars: BestStars) => bestStars.filter((s) => s === stars).length;
  const unpracticed = bestStars.filter((s) => s === 0).length;
  const pct = (n: number) => Math.round((n / total) * 100);

  return {
    totalSentences: total,
    bestStars,
    percentages: {
      threeStar: pct(count(3)),
      twoStar: pct(count(2)),
      oneStar: pct(count(1)),
      unpracticed: pct(unpracticed),
    },
  };
}
