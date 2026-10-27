# 03: 校对页可编辑标题（发布以新标题为准）

**What to build:** 统一校对页头部的草稿标题改为可编辑：点击/聚焦变成输入框，失焦或回车保存（PATCH /api/drafts/[id]，body `{ title }`）；保存成功更新页面标题，发布生成的内容包即用新标题（buildContentPack 已取 `draft.title`，无需改定稿逻辑）。

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

## 实现

- API：`src/app/api/drafts/[id]/route.ts` 加 PATCH handler——鉴权（未登录 401）→ 本人草稿/存在 404 → status=proofreading（否则 409 DRAFT_NOT_EDITABLE）→ title 必须非空字符串 trim（否则 400 INVALID_TITLE）→ repo 更新 → 返回 `{ title }`。repo.ts 加 `setDraftTitle(db, id, title)`
- UI：头部 `<h1>` 换为 input（样式融入：透明背景、focus 时 ring）；失焦/回车保存，成功在 banner 显示「标题已保存 ✓」（失败「标题保存失败」）；空标题不提交并回滚显示
- 保存中/后的状态进票 01 的统一 banner 派生链（titleSaving/titleSaved/titleError 优先级仅次于 actionError）

## 验收

- [x] 改标题失焦保存，刷新后仍为新标题；发布后内容包 title 为新标题（finalize 测试或手工查包）
- [x] 空标题 400；他人草稿 404；published 草稿 409；未登录 401
- [x] npm test / typecheck 全绿（只增不减）
