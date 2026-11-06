/**
 * 练习结束页的数据形状与展示映射（纯函数）。
 * PracticeFlow 一轮练完后把本轮汇总写进 sessionStorage，跳转到独立的
 * /units/[id]/finish 页面展示；本模块只负责「汇总 → 文案/去向」的映射。
 */
import { WEEKLY_RUN_LIMIT } from "@/lib/domain/limits";

export interface FinishPayload {
  unitId: string;
  title: string;
  type: "standard" | "custom";
  total: number;
  /** 本轮出过分（练过）的句子数 */
  practiced: number;
  /** 本轮句子星合计（客户端口径）；完整练习时只作服务端值缺失的兜底 */
  earned: number;
  runStars: number | null;
  runDoubled: boolean;
  /** 写入后的本周完整练习次数（0–3） */
  weeklyRuns: number;
  weeklyLimitReached: boolean;
}

/** 一轮练习结果在 sessionStorage 的键（按内容隔离） */
export function finishStorageKey(unitId: string): string {
  return `readalong:finish:${unitId}`;
}

export interface FinishView {
  complete: boolean;
  doubled: boolean;
  /** 完整练习＝服务端入账星；未完整＝本轮句子星合计 */
  awarded: number;
  /** 本周已练满：结束页「再练一遍」改为弹限次说明 */
  capped: boolean;
  listHref: string;
}

export function finishView(payload: FinishPayload): FinishView {
  const complete = payload.practiced === payload.total;
  return {
    complete,
    doubled: complete && payload.runDoubled,
    awarded: complete ? (payload.runStars ?? payload.earned) : payload.earned,
    capped: payload.weeklyRuns >= WEEKLY_RUN_LIMIT,
    listHref: payload.type === "custom" ? "/custom" : "/units",
  };
}
