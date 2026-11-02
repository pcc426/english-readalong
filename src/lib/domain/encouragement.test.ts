import { describe, it, expect } from "vitest";
import { encouragementFor } from "./encouragement";
import type { CompletionDistribution } from "./stats";

function dist(percentages: CompletionDistribution["percentages"]): CompletionDistribution {
  return {
    totalSentences: 4,
    bestStars: [],
    percentages,
  };
}

describe("鼓励语选择", () => {
  it("还没开练：欢迎开场", () => {
    const line = encouragementFor(
      dist({ threeStar: 0, twoStar: 0, oneStar: 0, unpracticed: 100 })
    );
    expect(line).toContain("开始");
  });

  it("有进步但未满星：鼓励继续", () => {
    const line = encouragementFor(
      dist({ threeStar: 25, twoStar: 25, oneStar: 25, unpracticed: 25 })
    );
    expect(line).toContain("继续");
  });

  it("全部三星：庆祝通关", () => {
    const line = encouragementFor(
      dist({ threeStar: 100, twoStar: 0, oneStar: 0, unpracticed: 0 })
    );
    expect(line).toContain("满星");
  });

  it("三档文案都不超过 10 字（含标点），且不提「三星」", () => {
    const lines = [
      encouragementFor(dist({ threeStar: 0, twoStar: 0, oneStar: 0, unpracticed: 100 })),
      encouragementFor(dist({ threeStar: 25, twoStar: 25, oneStar: 25, unpracticed: 25 })),
      encouragementFor(dist({ threeStar: 100, twoStar: 0, oneStar: 0, unpracticed: 0 })),
    ];
    for (const line of lines) {
      expect([...line].length).toBeLessThanOrEqual(10);
      expect(line).not.toContain("三星");
    }
  });
});
