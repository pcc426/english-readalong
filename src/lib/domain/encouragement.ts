import type { CompletionDistribution } from "./stats";

// 每档一句（内容卡一次只展示一句）。V0.3.1：一律 ≤10 字（含标点），
// 不提星级——「三星」对整条内容没有意义，只说「继续练」。
const START_LINE = "从第一句开始吧！";
const KEEP_GOING_LINE = "真棒，继续读！";
const ALL_DONE_LINE = "全部满星，太棒了！";

/** 按单元完成度选一句鼓励语（儿童激励的核心反馈之一）。 */
export function encouragementFor(dist: CompletionDistribution): string {
  const { threeStar, unpracticed } = dist.percentages;
  if (threeStar === 100) return ALL_DONE_LINE;
  if (unpracticed === 100) return START_LINE;
  return KEEP_GOING_LINE;
}
