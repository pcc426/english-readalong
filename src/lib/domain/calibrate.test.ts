import { describe, it, expect } from "vitest";
import { adjustBounds, MIN_CLIP } from "./calibrate";

describe("校对边界微调", () => {
  it("正常微调起点和终点", () => {
    expect(adjustBounds({ start: 6, end: 13 }, "start", 0.25)).toEqual({ start: 6.25, end: 13 });
    expect(adjustBounds({ start: 6, end: 13 }, "end", -0.5)).toEqual({ start: 6, end: 12.5 });
  });

  it("起点不能小于 0", () => {
    expect(adjustBounds({ start: 0.1, end: 5 }, "start", -0.25)).toEqual({ start: 0, end: 5 });
  });

  it("起点不能越过终点（至少保留最小片段）", () => {
    const result = adjustBounds({ start: 4.9, end: 5 }, "start", 0.25);
    expect(result.start).toBeCloseTo(5 - MIN_CLIP, 5);
  });

  it("终点不能贴近到越过起点", () => {
    const result = adjustBounds({ start: 5, end: 5.1 }, "end", -0.25);
    expect(result.end).toBeCloseTo(5 + MIN_CLIP, 5);
  });
});
