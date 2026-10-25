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
