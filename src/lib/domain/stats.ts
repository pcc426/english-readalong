import type { Db } from "../db";
import type { UnitPack } from "../content/schema";
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

/**
 * 每句最好成绩（含达成时间）。平手取最新一次（id 最大）。
 * 完成度统计与单元详情共用此口径，避免两处实现漂移。
 */
export function bestAttemptsBySentence(
  db: Db,
  unitId: string
): Map<number, BestAttempt> {
  const rows = db
    .prepare(
      `SELECT sentence_index, score, created_at FROM practice_attempts
       WHERE unit_id = ? ORDER BY id`
    )
    .all(unitId) as Array<{
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
 * 单元完成度：每句取练习记录中的最好成绩映射为星级，
 * 百分比按全部句子数四舍五入（四类各自独立取整，合计可能 ±1%）。
 */
export function completionDistribution(db: Db, unit: UnitPack): CompletionDistribution {
  const bestByIndex = bestAttemptsBySentence(db, unit.id);

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
