import path from "node:path";
import { mkdirSync } from "node:fs";
import { openDb } from "@/lib/db";
import { listUnitPacks } from "@/lib/content/loader";
import { completionDistribution } from "@/lib/domain/stats";
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
  return process.env.CONTENT_DIR ?? path.join(process.cwd(), "content", "units");
}

function dbPath(): string {
  const p =
    process.env.DB_PATH ?? path.join(process.cwd(), "data", "readalong.db");
  mkdirSync(path.dirname(p), { recursive: true });
  return p;
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
