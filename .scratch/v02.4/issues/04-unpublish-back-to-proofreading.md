# 04: 发布后可退回校对（unpublish，清练习记录）

**What to build:** 已发布内容，发布者可「退回校对」：状态 published → proofreading，同时①清空该内容**所有账号**的练习记录（句子结构可能变化，旧进度错位，用户明确要求清空）、②删除已发布内容包文件（从所有账号的列表与练习中消失）。草稿句子原样保留，改错句 → 重新确认 → 再次定稿（同 id，练习链接不变）。

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

## 实现

- `src/lib/drafts/finalize.ts` 加 `unpublishDraft(db, draft)`：事务内 `DELETE FROM practice_attempts WHERE unit_id = draft.id` + `UPDATE content_drafts SET status='proofreading', updated_at` ；事务后 `rmSync` 内容包文件（custom=packPathFor / standard=standardPackPathFor，`force: true` 文件已缺失不算错）。加 rmSync import
- 路由 `POST /api/drafts/[id]/unpublish/route.ts`：未登录 401 → 本人草稿/存在 404（不暴露他人）→ status=published 才可退回（否则 409 NOT_PUBLISHED）→ 执行 → `{ ok: true }`
- UI（两处 published 态）：
  - `src/app/(shell)/custom/[id]/page.tsx`：published 时显示「退回校对」按钮（危险样式），`window.confirm` 写明「退回后该内容对所有家庭不可见，且已有的全部练习记录将被清空」；成功后 loadDraft() 回校对态 UI
  - `src/app/(shell)/admin/standard/StandardAdminClient.tsx`：published 草稿卡「查看 →」旁加「退回校对」，同样确认文案；成功后 loadDrafts()
- 已发布守卫（校对页）不需要退回按钮（入口在详情/列表页）

## 测试

- finalize.test.ts：unpublishDraft——两个账号各落练习记录 → 退回后 attempts 清空、状态 proofreading、内容包文件被删（先 finalizeDraft 落包）；再次 finalizeDraft 可重建包（同 id）
- 路由测试：401 / 他人 404 / 非 published 409 / 本人 published 200 且生效

## 验收

- [x] 上述测试全过；npm test / typecheck 全绿（基线 398 只增不减）
- [x] 退回后：列表消失、练习接口 404、草稿回校对态可再编辑发布（手工冒烟）

## Comments

- 2026-10-27 实现并 API 冒烟：published 草稿退回后状态回 proofreading、两个家庭的练习记录清空、内容包文件删除；改标题（PATCH）后重新定稿，新内容包带新标题、同 id 练习链接不变。UI 按钮接线已实现（custom 详情页 + admin 标准列表），浏览器点击验证因工具限流未跑，走查与测试覆盖同一请求路径。
