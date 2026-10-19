import { describe, it, expect } from "vitest";
import {
  COUNTDOWN_START,
  initialFlow,
  reduceFlow,
  type FlowState,
} from "./practice-flow";

const TOTAL = 3;

describe("逐句练习流转状态机", () => {
  it("初始状态停在第一句等待开始", () => {
    expect(initialFlow()).toEqual({ step: "idle", index: 0 });
  });

  it("开始后播放当前句，播完进入倒计时等待", () => {
    let state: FlowState = initialFlow();
    state = reduceFlow(state, { type: "begin" }, TOTAL);
    expect(state).toEqual({ step: "playing", index: 0 });

    state = reduceFlow(state, { type: "clipEnded" }, TOTAL);
    expect(state).toEqual({ step: "waiting", index: 0, secondsLeft: COUNTDOWN_START });
  });

  it("倒计时逐秒递减，归零自动进下一句", () => {
    let state: FlowState = { step: "waiting", index: 0, secondsLeft: COUNTDOWN_START };
    state = reduceFlow(state, { type: "tick" }, TOTAL);
    expect(state).toEqual({ step: "waiting", index: 0, secondsLeft: COUNTDOWN_START - 1 });

    // 连续 tick 直到归零
    while (state.step === "waiting") state = reduceFlow(state, { type: "tick" }, TOTAL);
    expect(state).toEqual({ step: "playing", index: 1 });
  });

  it("最后一句倒计时结束进入收尾，而不是越界", () => {
    let state: FlowState = { step: "waiting", index: TOTAL - 1, secondsLeft: COUNTDOWN_START };
    while (state.step === "waiting") state = reduceFlow(state, { type: "tick" }, TOTAL);
    expect(state).toEqual({ step: "finished" });
  });

  it("非等待态的 tick 被忽略", () => {
    const state = reduceFlow(initialFlow(), { type: "tick" }, TOTAL);
    expect(state).toEqual({ step: "idle", index: 0 });
  });

  it("非等待态的 skip 同样被忽略（对称防御）", () => {
    const state = reduceFlow(initialFlow(), { type: "skip" }, TOTAL);
    expect(state).toEqual({ step: "idle", index: 0 });
  });

  it("倒计时中可跳过：中间句跳到下一句，最后一句跳到收尾", () => {
    let state: FlowState = { step: "waiting", index: 0, secondsLeft: 3 };
    state = reduceFlow(state, { type: "skip" }, TOTAL);
    expect(state).toEqual({ step: "playing", index: 1 });

    state = { step: "waiting", index: TOTAL - 1, secondsLeft: 2 };
    state = reduceFlow(state, { type: "skip" }, TOTAL);
    expect(state).toEqual({ step: "finished" });
  });

  it("手动跳转到任意句子立即开始播放该句", () => {
    const state = reduceFlow(initialFlow(), { type: "select", index: 2 }, TOTAL);
    expect(state).toEqual({ step: "playing", index: 2 });
  });

  it("收尾后仍可手动跳回任意句子重练", () => {
    const state = reduceFlow({ step: "finished" }, { type: "select", index: 0 }, TOTAL);
    expect(state).toEqual({ step: "playing", index: 0 });
  });

  it("跳转越界被忽略（防御）", () => {
    const state = reduceFlow(initialFlow(), { type: "select", index: 99 }, TOTAL);
    expect(state).toEqual({ step: "idle", index: 0 });
  });
});
