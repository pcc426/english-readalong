// 校对页唯一状态条（V0.3.1 票 04）：把保存态与教材相关提示收进同一行，
// 只渲染一条，高度固定（票 10 的 min-h-8 由调用方负责）。
import { TEXTBOOK_MISALIGNED_HINT } from "@/components/proofread/textbook";

export type StatusTone = "error" | "saving" | "warn" | "success" | "idle";

export interface ProofreadStatus {
  tone: StatusTone;
  text: string;
}

export interface ProofreadStatusInput {
  /** 结构操作（插句/合并/删除）失败 */
  actionError: string | null;
  titleSave: "idle" | "saving" | "saved" | "error";
  sentenceSave: "idle" | "saving" | "saved" | "error" | "needs-reconfirm";
  /** 标准草稿的教材原文加载失败 */
  textbookFailed: boolean;
  /** 标准草稿与教材模块不再 1:1 对齐（句子被增删过） */
  textbookMisaligned: boolean;
}

/**
 * 优先级（高 → 低）：结构操作错误 > 保存失败 > 教材原文加载失败 >
 * 保存中 > 句子已修改请重新确认 > 句子已增删请手动对照复制 > 已保存。
 * saved 与 misaligned 都常驻，下一次编辑开始时被 saving 替换。
 */
export function resolveProofreadStatus(
  input: ProofreadStatusInput
): ProofreadStatus {
  const { actionError, titleSave, sentenceSave } = input;
  if (actionError) return { tone: "error", text: actionError };
  if (titleSave === "error" || sentenceSave === "error")
    return { tone: "error", text: "保存失败，请重试" };
  if (input.textbookFailed)
    return { tone: "error", text: "教材原文加载失败，可直接手工校对" };
  if (titleSave === "saving" || sentenceSave === "saving")
    return { tone: "saving", text: "保存中…" };
  if (sentenceSave === "needs-reconfirm")
    return { tone: "warn", text: "句子已修改，请重新确认" };
  if (input.textbookMisaligned)
    return { tone: "warn", text: TEXTBOOK_MISALIGNED_HINT };
  // 刚打开、还没任何修改：淡色占位（票 10 的 idle），与「已保存过」区分
  if (titleSave === "idle" && sentenceSave === "idle")
    return { tone: "idle", text: "所有修改已保存" };
  return { tone: "success", text: "所有修改已保存" };
}
