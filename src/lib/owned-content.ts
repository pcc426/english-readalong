// 按账号组装内容视图（票 10 归属隔离）。
// 内容视图层（src/lib/content/view.ts）的统计口径是全量的、且不在本票的文件
// 所有权内；归属覆盖逻辑收敛在这里，供单元详情路由/页面与单元列表路由共用，
// 避免补丁散落多处漂移。等视图层原生支持账号维度后可整体下沉。
import { openDb, dbPath } from "@/lib/db";
import {
  getContentDetail,
  getContentOverview,
  type ContentDetail,
  type ContentOverview,
} from "@/lib/content/view";
import { listContent } from "@/lib/content/loader";
import { bestAttemptsBySentence, completionDistribution, latestRunStars } from "@/lib/domain/stats";
import { encouragementFor } from "@/lib/domain/encouragement";
import { mediaUrl } from "@/lib/media-url";

/**
 * 内部 /media/ 地址 → 鉴权媒体路由（票 01/05）：上传类内容（自定义与标准上传）
 * 改写为 /api/media/<accountId>/<file>；随代码内容的裸文件名改写为
 * /api/media/shipped/<file>。poster 与 video 同形，共用本改写。
 */
function authMediaUrl(source: string, ref: string): string {
  if (source === "custom-upload" || source === "standard-upload") {
    return mediaUrl(ref.replace(/^\/media\//, ""));
  }
  if (ref.startsWith("/media/")) {
    const name = ref.slice("/media/".length);
    return `/api/media/shipped/${encodeURIComponent(name)}`;
  }
  return ref;
}

/**
 * 单元详情（按账号）：句子最好成绩只取本人练习记录。
 * 自定义内容的视频引用是 <accountId>/<file>（票 09 定稿契约），
 * 统一改写为鉴权媒体路由地址；标准内容保持公开静态路径。
 * 内容不可见（不存在/他人的自定义内容/关闭态下的标准内容）返回 null。
 * allowStandard（v0.3.6）：标准内容可见性开关关闭时，非管理员按不存在处理。
 */
export function ownedContentDetail(
  contentId: string,
  accountId: string,
  options: { allowStandard: boolean }
): ContentDetail | null {
  const unit = getContentDetail(contentId, { accountId });
  if (!unit) return null;
  if (unit.type === "standard" && !options.allowStandard) return null;

  const db = openDb(dbPath());
  try {
    const bestByIndex = bestAttemptsBySentence(db, unit.id, { owner: accountId });
    for (const s of unit.sentences) {
      const best = bestByIndex.get(s.index);
      s.bestScore = best?.score ?? null;
      s.bestAt = best?.createdAt ?? null;
    }
  } finally {
    db.close();
  }

  // 上传类内容（自定义与标准）的视频引用是 <accountId>/<file>（票 09/12 定稿契约），
  // 统一改写为鉴权媒体路由地址；随代码的标准内容（video 是文件名）同样不静态公开，
  // 走 /api/media/shipped/<文件名> 鉴权命名空间。封面（票 01）与视频同一套改写。
  unit.video = authMediaUrl(unit.source, unit.video);
  if (unit.poster) {
    unit.poster = authMediaUrl(unit.source, unit.poster);
  }
  return unit;
}

/**
 * 内容列表（按账号）：可见性走内容缝（标准全部 + 本账号自定义，
 * spec「内容列表接口」），完成度分布与鼓励语只按本人练习记录计算。
 * onlyStandard（V0.2 整改）：「教材内容」页只显示平台公开的标准内容
 * （spec 界面布局「教材内容=平台公开的沪教版标准内容」），
 * 本账号自定义内容改由「自定义内容」页经 /api/drafts 展示。
 */
export function ownedContentOverview(
  accountId: string,
  options: { onlyStandard?: boolean } = {}
): ContentOverview[] {
  const query = options.onlyStandard ? {} : { accountId };
  const units = getContentOverview(query);
  const packs = new Map(listContent(query).map((p) => [p.id, p] as const));
  const db = openDb(dbPath());
  try {
    for (const u of units) {
      const pack = packs.get(u.id);
      if (!pack) continue;
      const dist = completionDistribution(db, pack, { owner: accountId });
      u.percentages = dist.percentages;
      u.encouragement = encouragementFor(dist);
      // 最近一次练习的总星数（票 04）：与完成度同批按账号覆盖全量视图的 null 占位
      u.latestRunStars = latestRunStars(db, pack.id, { owner: accountId });
      // 封面（票 05 网格卡）：列表行的 /media/ 内部地址同样改写为鉴权路由
      if (u.poster) {
        u.poster = authMediaUrl(u.source, u.poster);
      }
    }
  } finally {
    db.close();
  }
  return units;
}
