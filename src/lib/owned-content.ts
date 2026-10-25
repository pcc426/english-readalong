// 按账号组装内容视图（票 10 归属隔离）。
// 内容视图层（src/lib/content/view.ts）的统计口径是全量的、且不在本票的文件
// 所有权内；归属覆盖逻辑收敛在这里，供单元详情路由/页面与单元列表路由共用，
// 避免补丁散落多处漂移。等视图层原生支持账号维度后可整体下沉。
import { openDb, dbPath } from "@/lib/db";
import { getContentDetail, type ContentDetail } from "@/lib/content/view";
import { bestAttemptsBySentence } from "@/lib/domain/stats";

/**
 * 单元详情（按账号）：句子最好成绩只取本人练习记录。
 * 自定义内容的视频引用是 <accountId>/<file>（票 09 定稿契约），
 * 统一改写为鉴权媒体路由地址；标准内容保持公开静态路径。
 * 内容不可见（不存在/他人的自定义内容）返回 null。
 */
export function ownedContentDetail(
  contentId: string,
  accountId: string
): ContentDetail | null {
  const unit = getContentDetail(contentId, { accountId });
  if (!unit) return null;

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

  if (unit.source === "custom-upload") {
    unit.video = unit.video.replace(/^\/media\//, "/api/media/");
  }
  return unit;
}
