# 01: 删除句子与教材原文的对齐比较

**What to build:** 讯飞断句与教材断句天然不同（口语 3 句常被转成 1 条长句），校对时本来就要手工重切，「句数是否与教材一致」不再是有意义的信号。删掉这段防错位逻辑，教材原文参照保留。

1. 删除 `src/components/proofread/textbook.ts`（`textbookAligns` + `TEXTBOOK_MISALIGNED_HINT`）与 `textbook.test.ts`。
2. 校对页 `src/app/(shell)/drafts/[id]/proofread/page.tsx`：
   - 删除 `textbookAligned` 计算与传给状态条的 `textbookMisaligned`
   - 删除「采用教材原文」按钮与 `handleAdopt()`（其存在前提正是 1:1 对齐；无守卫时按下标替换会整段错位）
   - 保留教材原文参照块与 `textbookSentences` 拉取逻辑
3. `status.ts` 删除 `textbookMisaligned` 入参与分支；优先级变为：结构操作错误 > 保存失败 > 教材原文加载失败 > 保存中 > 句子已修改请重新确认 > 已保存。

**Blocked by:** None

**Status:** ready-for-agent

## 实现要点

- 教材原文加载失败提示（`textbookFailed`）保留——那是「参照不可用」，与断句无关
- `src/lib/alignment/` 不动（那是另一套离线对齐工具，本票不涉及）

## 验收

- [x] 标准草稿插入一句后：状态条只有一条且显示「所有修改已保存」，无「句子已增删」
- [x] 校对页不再出现「采用教材原文」按钮
- [x] 教材原文仍在当前句下方显示
- [x] status 单测更新；npm test / typecheck / build 全绿

## Comments

- 2026-11-02 实施并验收（v0.3.2）：删除 textbook.ts + 其 4 条测试、状态条 textbookMisaligned 分支、采用按钮与 handleAdopt。HTTP + 浏览器实测（临时库副本，3003）：插句后状态条 1 条「所有修改已保存」、无「句子已增删」、无「采用教材原文」，教材原文显示 "Shenshen, it's your photo."。583 测试通过（v0.3.1 588 −5 条失效断言），typecheck / build 绿。
