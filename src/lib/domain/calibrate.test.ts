import { describe, it, expect } from "vitest";
import { adjustBounds, adjustBoundsMs, MIN_CLIP, MIN_CLIP_MS } from "./calibrate";

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

describe("草稿句子毫秒微调（切点校对页）", () => {
  it("正常微调，结果为整数毫秒", () => {
    expect(adjustBoundsMs({ start: 6000, end: 13000 }, "start", 250)).toEqual({
      start: 6250,
      end: 13000,
    });
    expect(adjustBoundsMs({ start: 3400, end: 6100 }, "end", -250)).toEqual({
      start: 3400,
      end: 5850,
    });
  });

  it("起点不能小于 0", () => {
    expect(adjustBoundsMs({ start: 100, end: 5000 }, "start", -250)).toEqual({
      start: 0,
      end: 5000,
    });
  });

  it("起点不能越过终点（至少保留最小片段 200ms）", () => {
    const result = adjustBoundsMs({ start: 4900, end: 5000 }, "start", 250);
    expect(result.start).toBe(5000 - MIN_CLIP_MS);
    expect(result.end).toBe(5000);
  });

  it("终点不能贴近到越过起点", () => {
    const result = adjustBoundsMs({ start: 5000, end: 5100 }, "end", -250);
    expect(result.end).toBe(5000 + MIN_CLIP_MS);
    expect(result.start).toBe(5000);
  });
});
