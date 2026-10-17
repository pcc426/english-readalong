import { describe, it, expect } from "vitest";
import { mapScoreToStars } from "./stars";

describe("星级映射", () => {
  it("90 分及以上为三星（含边界）", () => {
    expect(mapScoreToStars(90)).toBe(3);
    expect(mapScoreToStars(100)).toBe(3);
  });

  it("89 分为两星（三星线下）", () => {
    expect(mapScoreToStars(89)).toBe(2);
  });

  it("75 分为两星（含边界）", () => {
    expect(mapScoreToStars(75)).toBe(2);
  });

  it("74 分及以下为一星", () => {
    expect(mapScoreToStars(74)).toBe(1);
    expect(mapScoreToStars(0)).toBe(1);
  });
});
