import { describe, it, expect } from "vitest";
import { resolveProofreadStatus, type ProofreadStatusInput } from "./status";

const base: ProofreadStatusInput = {
  actionError: null,
  titleSave: "saved",
  sentenceSave: "saved",
  textbookFailed: false,
  textbookMisaligned: false,
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

  it("句子已增删：单条 amber 提示（不再额外渲染第二条）", () => {
    const s = resolveProofreadStatus({ ...base, textbookMisaligned: true });
    expect(s.tone).toBe("warn");
    expect(s.text).toBe("句子已增删，请手动对照复制");
  });

  it("保存中压过教材增删提示：编辑时先看到保存态", () => {
    const s = resolveProofreadStatus({
      ...base,
      sentenceSave: "saving",
      textbookMisaligned: true,
    });
    expect(s).toEqual({ tone: "saving", text: "保存中…" });
  });

  it("保存失败压过教材增删提示", () => {
    const s = resolveProofreadStatus({
      ...base,
      sentenceSave: "error",
      textbookMisaligned: true,
    });
    expect(s.tone).toBe("error");
    expect(s.text).toBe("保存失败，请重试");
  });

  it("待重新确认压过教材增删提示", () => {
    const s = resolveProofreadStatus({
      ...base,
      sentenceSave: "needs-reconfirm",
      textbookMisaligned: true,
    });
    expect(s.text).toBe("句子已修改，请重新确认");
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
      textbookMisaligned: true,
    });
    expect(s.text).toBe("删除失败");
  });
});
