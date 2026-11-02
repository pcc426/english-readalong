# 01: 自定义内容定稿确认文案按内容类型区分

**What to build:** 预览页点【定稿发布】的确认弹窗现在对所有内容都写「发布后所有账号可见、可跟读」，但自定义内容只对账号本人可见（GLOSSARY「自定义内容」）。按内容类型给不同提示。

1. `src/lib/content/view.ts`：`ContentDetail` 增加 `type: "standard" | "custom"`；`getContentDetail` 从 `pack.type ?? "standard"` 赋值（内容包 schema 里 type 缺省即 standard）。
2. `src/app/(shell)/units/[id]/PracticeFlow.tsx` 的 `publishDraft()` 确认文案分支：
   - standard → `确定把「{title}」定稿发布吗？发布后所有账号可见、可跟读。`
   - custom → `确定把「{title}」定稿发布吗？发布后只有你自己的账号可见、可跟读。`
3. 预览页（票 08 的 `buildPreviewDetail`）同样经 `ContentDetail` 走，确认文案自动一致。

**Blocked by:** None

**Status:** ready-for-agent

## 实现要点

- 不改 publish API 与服务端门禁（ADR 0005）
- 文案抽成纯函数（如 `publishConfirmText(type, title)`）放 PracticeFlow 同目录，便于单测
- 现有 `preview.test.ts` / `practice-panel.test.ts` 的字面量若缺 `type` 字段要补

## 验收

- [ ] 自定义草稿预览发布：确认弹窗写「只有你自己的账号可见」
- [ ] 标准草稿预览发布：弹窗仍写「所有账号可见」
- [ ] 单元测试覆盖两种文案；npm test / typecheck / build 全绿
- [ ] 浏览器实测自定义内容一次（不实际发布也可，看弹窗文案即可）

## Comments

- 2026-11-02 实施并验收（v0.3.1）：ContentDetail 增加 type（view.ts 从 pack.type ?? standard，preview.ts 取 draft.type）；PracticeFlow 改用 publish-confirm.ts 的纯函数。浏览器实测：自定义草稿弹窗「发布后只有你自己的账号可见、可跟读。」；标准草稿仍「发布后所有账号可见、可跟读。」。新增 publish-confirm.test.ts 2 例。 全量 588 测试通过（v0.3 基线 577 + 11），typecheck / build 绿。
