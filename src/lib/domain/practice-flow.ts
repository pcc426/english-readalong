/**
 * 逐句练习的流转状态机（纯逻辑，供 UI 的 useReducer 使用）。
 * 节奏：播一句示范 → 播完 3-2-1 倒计时 → 自动进下一句；任意时刻可手动跳句。
 * "开始"门槛是刻意的：iPad Safari 要求用户手势后才能自动播放带声音的视频。
 */

export type FlowState =
  | { step: "idle"; index: number } // 页面打开、还没按"开始"
  | { step: "playing"; index: number } // 正在播放该句示范
  | { step: "waiting"; index: number; secondsLeft: number } // 播完该句，倒计时后自动进下一句
  | { step: "finished" }; // 整个单元的示范连播完毕

export type FlowEvent =
  | { type: "begin" }
  | { type: "clipEnded" }
  | { type: "tick" }
  | { type: "skip" }
  | { type: "select"; index: number };

/** 倒计时起始秒数（3-2-1 后自动进下一句） */
export const COUNTDOWN_START = 3;
/** 倒计时每秒一跳 */
export const TICK_MS = 1000;

export function initialFlow(): FlowState {
  return { step: "idle", index: 0 };
}

export function reduceFlow(state: FlowState, event: FlowEvent, total: number): FlowState {
  switch (event.type) {
    case "begin": {
      if (total === 0) return { step: "finished" };
      const from = state.step === "finished" ? 0 : state.index;
      return { step: "playing", index: Math.min(from, total - 1) };
    }
    case "clipEnded":
      return state.step === "playing"
        ? { step: "waiting", index: state.index, secondsLeft: COUNTDOWN_START }
        : state;
    case "tick": {
      if (state.step !== "waiting") return state;
      return state.secondsLeft > 1
        ? { ...state, secondsLeft: state.secondsLeft - 1 }
        : state.index + 1 < total
          ? { step: "playing", index: state.index + 1 }
          : { step: "finished" };
    }
    case "skip":
      if (state.step !== "waiting") return state;
      return state.index + 1 < total
        ? { step: "playing", index: state.index + 1 }
        : { step: "finished" };
    case "select":
      if (event.index < 0 || event.index >= total) return state;
      return { step: "playing", index: event.index };
  }
}
