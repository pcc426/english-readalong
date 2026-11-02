# 04: 校对页只保留一条状态栏

**What to build:** 校对页现在有两条状态提示：V0.3 票 10 的常驻状态条，以及标准草稿在句子增删后单独渲染的「句子已增删，请手动对照复制」（`textbookHint`）。两行占高度，用户要求只留一条。

1. 把 `textbookHint` 的两种状态并入唯一的 `status` 计算（`src/app/(shell)/drafts/[id]/proofread/page.tsx`）：
   - 教材原文加载失败（standard + textbookFailed）→ error 色，「教材原文加载失败，可直接手工校对」
   - 句子已增删（standard + textbookSentences 非空 + 不对齐）→ amber，「句子已增删，请手动对照复制」
2. 优先级（高 → 低）：
   `结构操作错误 > 保存失败 > 教材原文加载失败 > 保存中 > 句子已修改，请重新确认 > 句子已增删，请手动对照复制 > 所有修改已保存`
3. 删除独立的 `{textbookHint && <p …/>}` 渲染块与 `textbookHint` 对象；`textbookAligned`、教材原文参照栏、错位时隐藏「采用教材原文」等逻辑保持不变。

**Blocked by:** None

**Status:** ready-for-agent

## 实现要点

- 状态条仍然固定高度常驻（票 10 的 min-h-8 不回归）
- `TEXTBOOK_MISALIGNED_HINT` 常量与 `textbook.ts` 保留（文案仍用它），只改变渲染位置
- 状态优先级要写成可测的纯函数（如 `resolveStatus(...)`），单测覆盖：增删句后只出一条 amber；同时发生保存错误时显示保存错误；自定义草稿永不出现教材相关两条

## 验收

- [ ] 标准草稿增删句后，右栏只有一条状态栏且显示「句子已增删，请手动对照复制」
- [ ] 自定义草稿校对页始终只有一条状态栏
- [ ] 连续编辑时状态条高度不变（不回归票 10）
- [ ] 优先级单测；npm test / typecheck / build 全绿；浏览器实测

## Comments

- 2026-11-02 实施并验收（v0.3.1）：新增 proofread/status.ts 的 resolveProofreadStatus（优先级：结构操作错误 > 保存失败 > 教材原文加载失败 > 保存中 > 待重新确认 > 句子已增删 > 已保存），7 例单测；删除第二条 textbookHint 渲染块。浏览器实测：自定义草稿状态条 1 条／32px；标准草稿插入一句后仍只有 1 条，显示「句子已增删，请手动对照复制」，高度 32px。 全量 588 测试通过（v0.3 基线 577 + 11），typecheck / build 绿。
