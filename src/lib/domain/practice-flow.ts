/**
 * 逐句练习的流转状态机（纯逻辑，供 UI 的 useReducer 使用）。
 * 节奏：播一句示范 → 播完进入录音态（轮到孩子跟读）→ 提交评分 → 出分展示
 * 约 2 秒 → 自动进下一句；任意时刻可手动跳句。
 * "开始"门槛是刻意的：iPad Safari 要求用户手势后才能自动播放带声音的视频。
 */

export type FlowState =
  | { step: "idle"; index: number } // 页面打开、还没按"开始"
  | { step: "playing"; index: number } // 正在播放该句示范
  | { step: "clipDone"; index: number } // 示范播完停在该句（仅 preview 模式，无录音环节）
  | { step: "recording"; index: number } // 示范播完，孩子跟读中
  | { step: "submitting"; index: number } // 录音已提交，评分中
  | {
      step: "scored";
      index: number;
      result: ScoreResult;
      secondsLeft: number;
      /** 孩子点了"听我读"/"再练一次"后冻结自动流转 */
      held: boolean;
    } // 出分展示，倒计时后自动进下一句
  | { step: "finished" }; // 整个单元练完

export interface ScoreResult {
  score: number;
  stars: number;
  isNewBest: boolean;
}

export type FlowEvent =
  | { type: "begin" }
  | { type: "clipEnded" }
  | { type: "submitting" }
  | { type: "submitFailed" }
  | { type: "scored"; result: ScoreResult }
  | { type: "hold" }
  | { type: "retry" }
  | { type: "replay" }
  | { type: "tick" }
  | { type: "skip" }
  | { type: "select"; index: number };

/** 出分展示的秒数（之后自动进下一句） */
export const SCORE_DISPLAY_SECONDS = 5;
/** 出分展示与录音计时共用每秒一跳 */
export const TICK_MS = 1000;

type SkippableState = Extract<FlowState, { step: "recording" | "submitting" | "scored" }>;

/** 这些状态下可以跳过当前句直接进下一句 */
export function canSkip(state: FlowState): state is SkippableState {
  return state.step === "recording" || state.step === "submitting" || state.step === "scored";
}

export function initialFlow(): FlowState {
  return { step: "idle", index: 0 };
}

/** 流转模式：practice 正式练习（录音+评分）；preview 预览（V0.3 票 08，播完停住不录音） */
export type FlowMode = "practice" | "preview";

/** 从 index 的展示态推进到下一句；没有下一句则收尾 */
function advanceFrom(index: number, total: number): FlowState {
  return index + 1 < total ? { step: "playing", index: index + 1 } : { step: "finished" };
}

export function reduceFlow(
  state: FlowState,
  event: FlowEvent,
  total: number,
  mode: FlowMode = "practice"
): FlowState {
  switch (event.type) {
    case "begin": {
      if (total === 0) return { step: "finished" };
      const from = state.step === "finished" ? 0 : state.index;
      return { step: "playing", index: Math.min(from, total - 1) };
    }
    case "clipEnded":
      if (state.step !== "playing") return state;
      // preview：示范播完停在该句等操作（重播/换句），不进录音态
      return mode === "preview"
        ? { step: "clipDone", index: state.index }
        : { step: "recording", index: state.index };
    case "submitting":
      return state.step === "recording" ? { step: "submitting", index: state.index } : state;
    case "submitFailed":
      // 回到录音态：录音进度不丢（UI 保留上一段录音可直接重试提交）
      return state.step === "submitting" ? { step: "recording", index: state.index } : state;
    case "scored":
      if (state.step !== "submitting") return state;
      return {
        step: "scored",
        index: state.index,
        result: event.result,
        secondsLeft: SCORE_DISPLAY_SECONDS,
        held: false,
      };
    case "hold":
      // 听自己录音/再练一次时冻结自动流转，把节奏交还给孩子
      return state.step === "scored" ? { ...state, held: true } : state;
    case "retry":
      // 出分后"再练一次"：回录音态重录本句
      return state.step === "scored" ? { step: "recording", index: state.index } : state;
    case "replay":
      // 录音态（practice）或播完停住态（preview）点"再播一遍"：重播本句示范
      return state.step === "recording" || state.step === "clipDone"
        ? { step: "playing", index: state.index }
        : state;
    case "tick": {
      if (state.step !== "scored" || state.held) return state;
      return state.secondsLeft > 1
        ? { ...state, secondsLeft: state.secondsLeft - 1 }
        : advanceFrom(state.index, total);
    }
    case "skip":
      // clipDone（preview 播完停住）同样可跳：句句听完后不必录音即可推进
      if (canSkip(state) || state.step === "clipDone") return advanceFrom(state.index, total);
      return state;
    case "select":
      if (event.index < 0 || event.index >= total) return state;
      return { step: "playing", index: event.index };
  }
}
