/**
 * 逐句练习的流转状态机（纯逻辑，供 UI 的 useReducer 使用）。
 * 节奏：播一句示范 → 播完等待约 1.5 秒 → 自动进下一句；任意时刻可手动跳句。
 * "开始"门槛是刻意的：iPad Safari 要求用户手势后才能自动播放带声音的视频。
 */

export type FlowState =
  | { step: "idle"; index: number } // 页面打开、还没按"开始"
  | { step: "playing"; index: number } // 正在播放该句示范
  | { step: "waiting"; index: number } // 播完该句，等自动流转
  | { step: "finished" }; // 整个单元的示范连播完毕

export type FlowEvent =
  | { type: "begin" }
  | { type: "clipEnded" }
  | { type: "advance" }
  | { type: "select"; index: number };

/** 自动流转前的等待毫秒数 */
export const ADVANCE_DELAY_MS = 1500;

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
      return state.step === "playing" ? { step: "waiting", index: state.index } : state;
    case "advance":
      if (state.step !== "waiting") return state;
      return state.index + 1 < total
        ? { step: "playing", index: state.index + 1 }
        : { step: "finished" };
    case "select":
      if (event.index < 0 || event.index >= total) return state;
      return { step: "playing", index: event.index };
  }
}
