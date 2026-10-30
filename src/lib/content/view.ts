import { openDb, dbPath } from "@/lib/db";
import { getContent, listContent, type ContentQuery } from "@/lib/content/loader";
import { bestAttemptsBySentence, completionDistribution } from "@/lib/domain/stats";
import { encouragementFor } from "@/lib/domain/encouragement";

export interface ContentOverview {
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

export interface ContentDetail {
  id: string;
  title: string;
  source: string;
  video: string;
  /** 竖版封面（9:16）；无封面为 null。这里是内部 /media/ 地址，owned-content 会改写为鉴权路由 */
  poster: string | null;
  sentences: SentenceDetail[];
}

/** 内容详情：句子列表 + 每句最好成绩及达成时间（评分类逻辑见票 05）。 */
export function getContentDetail(
  contentId: string,
  query: ContentQuery = {}
): ContentDetail | null {
  const pack = getContent(contentId, query);
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
      // 内部的 /media/ 地址不是最终 URL：owned-content 会改写为鉴权媒体路由
      // （随代码内容 → /api/media/shipped/…；上传类 → /api/media/<accountId>/…）
      video: `/media/${pack.video}`,
      poster: pack.poster ? `/media/${pack.poster}` : null,
      sentences,
    };
  } finally {
    db.close();
  }
}

/** 首页/内容列表的聚合视图：内容包 + 完成度 + 鼓励语。API 与页面共用。 */
export function getContentOverview(query: ContentQuery = {}): ContentOverview[] {
  const db = openDb(dbPath());
  try {
    return listContent(query).map((pack) => {
      const dist = completionDistribution(db, pack);
      return {
        id: pack.id,
        title: pack.title,
        source: pack.source,
        sentenceCount: pack.sentences.length,
        percentages: dist.percentages,
        encouragement: encouragementFor(dist),
      };
    });
  } finally {
    db.close();
  }
}
