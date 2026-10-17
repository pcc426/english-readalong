import type { CompletionDistribution } from "./stats";

// 每档一句（单元页一次只展示一句）
const START_LINE = "从第一句开始，每读一句就离满星更近一步！";
const KEEP_GOING_LINE = "真棒！继续读，三星在向你招手！";
const ALL_DONE_LINE = "太厉害了，整个单元满星通关！";

/** 按单元完成度选一句鼓励语（儿童激励的核心反馈之一）。 */
export function encouragementFor(dist: CompletionDistribution): string {
  const { threeStar, unpracticed } = dist.percentages;
  if (threeStar === 100) return ALL_DONE_LINE;
  if (unpracticed === 100) return START_LINE;
  return KEEP_GOING_LINE;
}
