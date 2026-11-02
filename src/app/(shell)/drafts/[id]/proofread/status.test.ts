import { describe, it, expect } from "vitest";
import { resolveProofreadStatus, type ProofreadStatusInput } from "./status";

const base: ProofreadStatusInput = {
  actionError: null,
  titleSave: "saved",
  sentenceSave: "saved",
  textbookFailed: false,
};

describe("校对页唯一状态条", () => {
  it("常态：所有修改已保存", () => {
    expect(resolveProofreadStatus(base)).toEqual({
      tone: "success",
      text: "所有修改已保存",
    });
  });

  it("刚打开未编辑：idle 淡色占位", () => {
    const s = resolveProofreadStatus({
      ...base,
      titleSave: "idle",
      sentenceSave: "idle",
    });
    expect(s.tone).toBe("idle");
  });

  it("保存中优先于已保存", () => {
    expect(resolveProofreadStatus({ ...base, sentenceSave: "saving" })).toEqual({
      tone: "saving",
      text: "保存中…",
    });
  });

  it("保存失败", () => {
    const s = resolveProofreadStatus({ ...base, sentenceSave: "error" });
    expect(s.tone).toBe("error");
    expect(s.text).toBe("保存失败，请重试");
  });

  it("待重新确认：句子被服务端打回 edited", () => {
    const s = resolveProofreadStatus({
      ...base,
      sentenceSave: "needs-reconfirm",
    });
    expect(s).toEqual({ tone: "warn", text: "句子已修改，请重新确认" });
  });

  it("教材原文加载失败：error 色，优先于保存态", () => {
    const s = resolveProofreadStatus({
      ...base,
      textbookFailed: true,
      sentenceSave: "saving",
    });
    expect(s.tone).toBe("error");
    expect(s.text).toContain("教材原文加载失败");
  });

  it("结构操作错误优先级最高", () => {
    const s = resolveProofreadStatus({
      ...base,
      actionError: "删除失败",
      sentenceSave: "error",
      textbookFailed: true,
    });
    expect(s.text).toBe("删除失败");
  });
});
