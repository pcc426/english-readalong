import path from "node:path";
import { mkdirSync } from "node:fs";
import { openDb } from "@/lib/db";
import { listUnitPacks } from "@/lib/content/loader";
import { bestAttemptsBySentence, completionDistribution } from "@/lib/domain/stats";
import { encouragementFor } from "@/lib/domain/encouragement";

export interface UnitOverview {
  id: string;
  title: string;
  source: string;
  sentenceCount: number;
  percentages: {
    threeStar: number;
    twoStar: number;
    oneStar: number;
    unpracticed: number;
  };
  encouragement: string;
}

function contentDir(): string {
  // 用 || 而非 ??：.env 里的空值行（CONTENT_DIR=）应视为未设置
  return process.env.CONTENT_DIR || path.join(process.cwd(), "content", "units");
}

function dbPath(): string {
  const p =
    process.env.DB_PATH || path.join(process.cwd(), "data", "readalong.db");
  mkdirSync(path.dirname(p), { recursive: true });
  return p;
}

export interface SentenceDetail {
  index: number;
  text: string;
  start: number | null;
  end: number | null;
  /** 该句最好一次练习的得分；从未练过为 null */
  bestScore: number | null;
  /** 最好成绩那次练习的时间 */
  bestAt: string | null;
}

export interface UnitDetail {
  id: string;
  title: string;
  source: string;
  video: string;
  sentences: SentenceDetail[];
}

/** 单元详情：句子列表 + 每句最好成绩及达成时间（评分类逻辑见票 05）。 */
export function getUnitDetail(unitId: string): UnitDetail | null {
  const pack = listUnitPacks(contentDir()).find((u) => u.id === unitId);
  if (!pack) return null;

  const db = openDb(dbPath());
  try {
    const bestByIndex = bestAttemptsBySentence(db, pack.id);
    const sentences: SentenceDetail[] = pack.sentences.map((s, index) => {
      const best = bestByIndex.get(index);
      return {
        index,
        text: s.text,
        start: s.start,
        end: s.end,
        bestScore: best?.score ?? null,
        bestAt: best?.createdAt ?? null,
      };
    });
    return {
      id: pack.id,
      title: pack.title,
      source: pack.source,
      video: `/media/${pack.video}`,
      sentences,
    };
  } finally {
    db.close();
  }
}

/** 首页/单元列表的聚合视图：内容包 + 完成度 + 鼓励语。API 与页面共用。 */
export function getUnitsOverview(): UnitOverview[] {
  const db = openDb(dbPath());
  try {
    return listUnitPacks(contentDir()).map((unit) => {
      const dist = completionDistribution(db, unit);
      return {
        id: unit.id,
        title: unit.title,
        source: unit.source,
        sentenceCount: unit.sentences.length,
        percentages: dist.percentages,
        encouragement: encouragementFor(dist),
      };
    });
  } finally {
    db.close();
  }
}
