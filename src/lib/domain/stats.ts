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

/**
 * 单元完成度：每句取练习记录中的最好成绩映射为星级，
 * 百分比按全部句子数四舍五入（四类各自独立取整，合计可能 ±1%）。
 */
export function completionDistribution(db: Db, unit: UnitPack): CompletionDistribution {
  const rows = db
    .prepare(
      `SELECT sentence_index, MAX(score) AS best FROM practice_attempts
       WHERE unit_id = ? GROUP BY sentence_index`
    )
    .all(unit.id) as Array<{ sentence_index: number; best: number }>;
  const bestByIndex = new Map(rows.map((r) => [r.sentence_index, r.best]));

  const bestStars: BestStars[] = unit.sentences.map((_, index) => {
    const best = bestByIndex.get(index);
    return best == null ? 0 : mapScoreToStars(best);
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
