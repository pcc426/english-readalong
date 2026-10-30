// 「自定义内容」列表页（票 06）的布局/筛选纯函数：tab 归属与排序。
// 与页面同目录，参照票 11 practice-panel 的模式——只做映射，不承载请求/状态逻辑。

/** 顶部 tab：可练习（已定稿）/ 制作中（转写中＋待校对），spec 决策 20 */
export type CustomTab = "ready" | "making";

/** 草稿状态名，与 GET /api/drafts 响应的 status 字段对应（壳不走 src/lib 类型） */
export type CustomDraftStatus = "transcribing" | "proofreading" | "published";

/** 默认 tab 由 ?tab=making 决定（票 07 上传成功跳回带此参），否则「可练习」 */
export function parseTabParam(raw: string | null): CustomTab {
  return raw === "making" ? "making" : "ready";
}

/** tab 归属：published 进「可练习」，其余（proofreading/transcribing）进「制作中」 */
export function tabOfStatus(status: CustomDraftStatus): CustomTab {
  return status === "published" ? "ready" : "making";
}

/** 按 createdAt 倒排（新上传卡在第一位，票 06 验收）。API 本就倒序返回，
 * 此处是页面侧的确定性兜底；同 createdAt 保持原相对顺序（稳定排序）。 */
export function sortByCreatedDesc<T extends { createdAt: string }>(
  items: readonly T[]
): T[] {
  return [...items].sort((a, b) =>
    a.createdAt === b.createdAt ? 0 : a.createdAt < b.createdAt ? 1 : -1
  );
}
