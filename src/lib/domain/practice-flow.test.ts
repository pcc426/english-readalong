import { describe, it, expect } from "vitest";
import { initialFlow, reduceFlow, type FlowState } from "./practice-flow";

const TOTAL = 3;

describe("逐句练习流转状态机", () => {
  it("初始状态停在第一句等待开始", () => {
    expect(initialFlow()).toEqual({ step: "idle", index: 0 });
  });

  it("开始后播放当前句，播完进入等待，到点自动进下一句", () => {
    let state: FlowState = initialFlow();
    state = reduceFlow(state, { type: "begin" }, TOTAL);
    expect(state).toEqual({ step: "playing", index: 0 });

    state = reduceFlow(state, { type: "clipEnded" }, TOTAL);
    expect(state).toEqual({ step: "waiting", index: 0 });

    state = reduceFlow(state, { type: "advance" }, TOTAL);
    expect(state).toEqual({ step: "playing", index: 1 });
  });

  it("最后一句播完等待后进入收尾，而不是越界", () => {
    let state: FlowState = { step: "playing", index: TOTAL - 1 };
    state = reduceFlow(state, { type: "clipEnded" }, TOTAL);
    state = reduceFlow(state, { type: "advance" }, TOTAL);
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
