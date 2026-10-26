// 教材原文参照的采用门禁（V0.2 整改，票 12 校对页）。
// 采用 = 把本句文本一键替换为教材原文，前提是草稿句子与教材模块
// 1:1 对齐；句子被增删过后逐句下标不再对应，采用会整段错位，
// 此时只保留教材原文参照、由人手动对照复制。

/** 句子已增删时校对页的提示文案（spec：防错位） */
export const TEXTBOOK_MISALIGNED_HINT = "句子已增删，请手动对照复制";

/**
 * 采用按钮的显示条件：草稿句子数与教材模块句数一致
 * （未编辑过句数的 1:1 对齐）。教材原文未加载（null）或句数不等 →
 * 不显示采用按钮，参照列表照常展示。
 */
export function textbookAligns(
  textbookSentences: string[] | null,
  sentenceCount: number
): boolean {
  return textbookSentences !== null && textbookSentences.length === sentenceCount;
}
