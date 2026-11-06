import { describe, it, expect } from "vitest";
import {
  finishStorageKey,
  finishView,
  type FinishPayload,
} from "./finish-summary";

function payload(overrides: Partial<FinishPayload> = {}): FinishPayload {
  return {
    unitId: "u1",
    title: "The dragon dance",
    type: "standard",
    total: 6,
    practiced: 6,
    earned: 14,
    runStars: 14,
    runDoubled: false,
    weeklyRuns: 1,
    weeklyLimitReached: false,
    ...overrides,
  };
}

describe("练习结束页展示映射", () => {
  it("完整练习：入账星取服务端值，未翻倍", () => {
    const view = finishView(payload());
    expect(view.complete).toBe(true);
    expect(view.doubled).toBe(false);
    expect(view.awarded).toBe(14);
  });

  it("翻倍轮次：awarded 为翻倍后的入账星", () => {
    const view = finishView(
      payload({ earned: 44, runStars: 88, runDoubled: true })
    );
    expect(view.doubled).toBe(true);
    expect(view.awarded).toBe(88);
  });

  it("未完整：不算翻倍，awarded 回退本轮句子星合计", () => {
    const view = finishView(
      payload({
        practiced: 3,
        earned: 8,
        runStars: null,
        runDoubled: false,
      })
    );
    expect(view.complete).toBe(false);
    expect(view.doubled).toBe(false);
    expect(view.awarded).toBe(8);
  });

  it("完整但服务端值缺失：回退客户端合计", () => {
    const view = finishView(payload({ earned: 12, runStars: null }));
    expect(view.awarded).toBe(12);
  });

  it("本周达到上限：capped 为 true，可据此拦「再练一遍」", () => {
    expect(finishView(payload({ weeklyRuns: 3 })).capped).toBe(true);
    expect(finishView(payload({ weeklyRuns: 2 })).capped).toBe(false);
  });

  it("返回列表去向按内容类型区分", () => {
    expect(finishView(payload({ type: "standard" })).listHref).toBe("/units");
    expect(finishView(payload({ type: "custom" })).listHref).toBe("/custom");
  });

  it("sessionStorage 键按内容隔离", () => {
    expect(finishStorageKey("u1")).not.toBe(finishStorageKey("u2"));
    expect(finishStorageKey("u1")).toContain("u1");
  });
});
