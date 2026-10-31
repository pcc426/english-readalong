/**
 * 练习页右栏（票 11）的展示映射：纯函数，供 PracticeFlow 渲染使用。
 * 只做「练习状态 → 文案/色调」的映射，不承载任何流程逻辑。
 */

import type { FlowState } from "@/lib/domain/practice-flow";

export interface ReplayControl {
  /** 按钮文案 */
  label: string;
  /** true＝高亮黄 bg-amber-400（可点击且非播放中）；false＝深灰 bg-slate-700 */
  highlight: boolean;
}

/**
 * 播放控制排中间按钮：录音态（practice）与播完停住态（preview，票 08）是
 * 重播本句示范（票 11 由「再读一遍」改名「再播一遍」），播放态是暂停/继续；
 * 其余状态按钮禁用，文案与深灰沿用现状。
 */
export function replayControl(step: FlowState["step"], isPaused: boolean): ReplayControl {
  if (step === "recording" || step === "clipDone")
    return { label: "🔁 再播一遍", highlight: true };
  if (step === "playing") {
    return isPaused
      ? { label: "▶ 继续", highlight: true }
      : { label: "⏸ 暂停", highlight: false };
  }
  return { label: isPaused ? "▶ 继续" : "⏸ 暂停", highlight: false };
}

export interface CellStars {
  /** 句格序号下方的小字：读过＝★×n，未练＝「未练」 */
  text: string;
  /** true＝读过（amber-500 加粗）；false＝未练（slate-400 常规） */
  learned: boolean;
}

/** 句格（票 11）：每格序号下方显示该句最佳星级 ★×n；没练过显示「未练」 */
export function cellStars(bestStars: number | null): CellStars {
  if (bestStars == null) return { text: "未练", learned: false };
  return { text: `★×${bestStars}`, learned: true };
}
