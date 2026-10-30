import { describe, it, expect } from "vitest";
import {
  SCORE_DISPLAY_SECONDS,
  initialFlow,
  reduceFlow,
  type FlowState,
} from "./practice-flow";

const TOTAL = 3;

/** 快速走到"录音中"第 index 句 */
function toRecording(index: number): FlowState {
  return { step: "recording", index };
}

describe("preview 模式（V0.3 票 08：预览不录音不评分）", () => {
  it("示范播完停在 clipDone，不进录音态", () => {
    const state = reduceFlow(
      { step: "playing", index: 1 },
      { type: "clipEnded" },
      TOTAL,
      "preview"
    );
    expect(state).toEqual({ step: "clipDone", index: 1 });
  });

  it("practice 模式（默认）播完仍进录音态，行为零变化", () => {
    expect(
      reduceFlow({ step: "playing", index: 0 }, { type: "clipEnded" }, TOTAL)
    ).toEqual({ step: "recording", index: 0 });
    expect(
      reduceFlow(
        { step: "playing", index: 0 },
        { type: "clipEnded" },
        TOTAL,
        "practice"
      )
    ).toEqual({ step: "recording", index: 0 });
  });

  it("clipDone 可再播一遍（重播本句示范）", () => {
    expect(
      reduceFlow({ step: "clipDone", index: 1 }, { type: "replay" }, TOTAL, "preview")
    ).toEqual({ step: "playing", index: 1 });
  });

  it("clipDone 可跳到下一句；末句播完跳过进收尾", () => {
    expect(
      reduceFlow({ step: "clipDone", index: 0 }, { type: "skip" }, TOTAL, "preview")
    ).toEqual({ step: "playing", index: 1 });
    expect(
      reduceFlow(
        { step: "clipDone", index: TOTAL - 1 },
        { type: "skip" },
        TOTAL,
        "preview"
      )
    ).toEqual({ step: "finished" });
  });

  it("clipDone 可点句格换句；评分事件在 preview 无效", () => {
    expect(
      reduceFlow(
        { step: "clipDone", index: 1 },
        { type: "select", index: 2 },
        TOTAL,
        "preview"
      )
    ).toEqual({ step: "playing", index: 2 });
    // 不录音就不可能有 recording 态：submitting/scored 从 clipDone 出发都无效
    expect(
      reduceFlow({ step: "clipDone", index: 1 }, { type: "submitting" }, TOTAL, "preview")
    ).toEqual({ step: "clipDone", index: 1 });
  });
});

describe("逐句练习流转状态机（含录音评分）", () => {
  it("初始停在第一句等待开始；开始后播放示范", () => {
    expect(initialFlow()).toEqual({ step: "idle", index: 0 });
    const state = reduceFlow(initialFlow(), { type: "begin" }, TOTAL);
    expect(state).toEqual({ step: "playing", index: 0 });
  });

  it("示范播完进入录音态（轮到孩子读）", () => {
    const state = reduceFlow({ step: "playing", index: 0 }, { type: "clipEnded" }, TOTAL);
    expect(state).toEqual({ step: "recording", index: 0 });
  });

  it("录音 → 提交中 → 出分（分数+星级+是否新纪录）", () => {
    let state: FlowState = toRecording(0);
    state = reduceFlow(state, { type: "submitting" }, TOTAL);
    expect(state).toEqual({ step: "submitting", index: 0 });

    state = reduceFlow(
      state,
      { type: "scored", result: { score: 92, stars: 3, isNewBest: true } },
      TOTAL
    );
    expect(state).toEqual({
      step: "scored",
      index: 0,
      result: { score: 92, stars: 3, isNewBest: true },
      secondsLeft: SCORE_DISPLAY_SECONDS,
      held: false,
    });
  });

  it("出分后可 retry 回录音态重录本句", () => {
    const state = reduceFlow(
      { step: "scored", index: 1, result: { score: 80, stars: 2, isNewBest: false }, secondsLeft: 2, held: false },
      { type: "retry" },
      TOTAL
    );
    expect(state).toEqual({ step: "recording", index: 1 });
  });

  it("录音态点 replay 重播本句示范，其他态忽略", () => {
    expect(reduceFlow({ step: "recording", index: 1 }, { type: "replay" }, TOTAL)).toEqual({
      step: "playing",
      index: 1,
    });
    expect(reduceFlow({ step: "playing", index: 0 }, { type: "replay" }, TOTAL)).toEqual({
      step: "playing",
      index: 0,
    });
    expect(reduceFlow(initialFlow(), { type: "replay" }, TOTAL)).toEqual({ step: "idle", index: 0 });
  });

  it("出分后 hold 冻结自动流转（听自己录音时不被切走）；skip 仍可用", () => {
    let state: FlowState = {
      step: "scored",
      index: 0,
      result: { score: 60, stars: 1, isNewBest: false },
      secondsLeft: 2,
      held: false,
    };
    state = reduceFlow(state, { type: "hold" }, TOTAL);
    expect(state).toEqual({
      step: "scored",
      index: 0,
      result: { score: 60, stars: 1, isNewBest: false },
      secondsLeft: 2,
      held: true,
    });
    // hold 后 tick 不再倒计时
    const afterTick = reduceFlow(state, { type: "tick" }, TOTAL);
    expect(afterTick).toEqual(state);
    // 但 skip 仍然有效
    const skipped = reduceFlow(afterTick, { type: "skip" }, TOTAL);
    expect(skipped).toEqual({ step: "playing", index: 1 });
  });

  it("出分展示 5 秒后自动进下一句示范", () => {
    let state: FlowState = {
      step: "scored",
      index: 0,
      result: { score: 92, stars: 3, isNewBest: true },
      secondsLeft: SCORE_DISPLAY_SECONDS,
      held: false,
    };
    state = reduceFlow(state, { type: "tick" }, TOTAL);
    expect(state).toEqual({
      step: "scored",
      index: 0,
      result: { score: 92, stars: 3, isNewBest: true },
      secondsLeft: SCORE_DISPLAY_SECONDS - 1,
      held: false,
    });
    while (state.step === "scored") state = reduceFlow(state, { type: "tick" }, TOTAL);
    expect(state).toEqual({ step: "playing", index: 1 });
  });

  it("最后一句出分展示完进入收尾", () => {
    let state: FlowState = {
      step: "scored",
      index: TOTAL - 1,
      result: { score: 80, stars: 2, isNewBest: false },
      secondsLeft: 1,
      held: false,
    };
    state = reduceFlow(state, { type: "tick" }, TOTAL);
    expect(state).toEqual({ step: "finished" });
  });

  it("提交失败回到录音态（进度不丢，可重试）", () => {
    const state = reduceFlow(
      { step: "submitting", index: 1 },
      { type: "submitFailed" },
      TOTAL
    );
    expect(state).toEqual({ step: "recording", index: 1 });
  });

  it("录音中/出分中可跳过到下一句，最后一句跳过进收尾", () => {
    let state: FlowState = reduceFlow(toRecording(0), { type: "skip" }, TOTAL);
    expect(state).toEqual({ step: "playing", index: 1 });

    state = reduceFlow(toRecording(TOTAL - 1), { type: "skip" }, TOTAL);
    expect(state).toEqual({ step: "finished" });

    state = reduceFlow(
      { step: "scored", index: 0, result: { score: 90, stars: 3, isNewBest: true }, secondsLeft: 2, held: false },
      { type: "skip" },
      TOTAL
    );
    expect(state).toEqual({ step: "playing", index: 1 });
  });

  it("手动跳句立即播放该句；收尾后可跳回；越界忽略", () => {
    expect(reduceFlow(initialFlow(), { type: "select", index: 2 }, TOTAL)).toEqual({
      step: "playing",
      index: 2,
    });
    expect(reduceFlow({ step: "finished" }, { type: "select", index: 0 }, TOTAL)).toEqual({
      step: "playing",
      index: 0,
    });
    expect(reduceFlow(initialFlow(), { type: "select", index: 99 }, TOTAL)).toEqual({
      step: "idle",
      index: 0,
    });
  });
});
