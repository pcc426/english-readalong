import { describe, expect, it } from "vitest";
import { TEXTBOOK_MISALIGNED_HINT, textbookAligns } from "./textbook";

describe("textbookAligns（采用教材原文的防错位门禁）", () => {
  it("句子数与教材模块句数一致：可采用（1:1 对齐）", () => {
    expect(textbookAligns(["a", "b", "c"], 3)).toBe(true);
    expect(textbookAligns([], 0)).toBe(true);
  });

  it("草稿句子被删/并后句数不等：不可采用", () => {
    expect(textbookAligns(["a", "b", "c"], 2)).toBe(false);
    expect(textbookAligns(["a"], 4)).toBe(false);
  });

  it("教材原文未加载（null，加载中/失败/custom 草稿）：不可采用", () => {
    expect(textbookAligns(null, 3)).toBe(false);
  });

  it("错位提示文案指向手动对照复制", () => {
    expect(TEXTBOOK_MISALIGNED_HINT).toContain("手动对照复制");
  });
});
