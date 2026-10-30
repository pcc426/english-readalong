import { openDb, dbPath } from "@/lib/db";
import { getContent, listContent, type ContentQuery } from "@/lib/content/loader";
import { standardEnumSubtitle } from "@/lib/textbook/enum-subtitle";
import { bestAttemptsBySentence, completionDistribution } from "@/lib/domain/stats";
import { encouragementFor } from "@/lib/domain/encouragement";

export interface ContentOverview {
  id: string;
  title: string;
  source: string;
  sentenceCount: number;
  /** 教材归属排序字段（票 03，spec 决策 18）：标准包带归属时非空；
   * custom 包/未迁移老包为 null（列表默认排序把它们稳定沉底）。 */
  seriesCode: string | null;
  bookId: string | null;
  unitNo: number | null;
  moduleKind: string | null;
  /** 枚举副标题（沪教版五上-Unit2-Story time-7句，票 03/spec 决策 15）；
   * 无归属时为 null，界面回退 sourceLabel 文案。 */
  subtitle: string | null;
  /** 竖版封面（9:16）内部 /media/ 地址（票 01/05）；无封面为 null。
   * 这里不是最终 URL，owned-content 会改写为鉴权媒体路由（同 video）。 */
  poster: string | null;
  percentages: {
    threeStar: number;
    twoStar: number;
    oneStar: number;
    unpracticed: number;
  };
  encouragement: string;
  /** 最近一次练习获得的总星数（票 04 / spec 决策 23–25）；从未练过为 null。
   * 本视图是全量口径、没有账号维度，这里恒为 null；
   * 按账号的值由 owned-content 在覆盖 percentages 时一并写入。 */
  latestRunStars: number | null;
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
  /** 枚举副标题（票 03）：标准包带归属时为枚举串；无归属（custom/老包）为 null，
   * 界面回退 sourceLabel。 */
  subtitle: string | null;
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
      subtitle: standardEnumSubtitle(pack),
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
        seriesCode: pack.seriesCode ?? null,
        bookId: pack.bookId ?? null,
        unitNo: pack.unitNo ?? null,
        moduleKind: pack.moduleKind ?? null,
        subtitle: standardEnumSubtitle(pack),
        poster: pack.poster ? `/media/${pack.poster}` : null,
        percentages: dist.percentages,
        encouragement: encouragementFor(dist),
        latestRunStars: null,
      };
    });
  } finally {
    db.close();
  }
}
