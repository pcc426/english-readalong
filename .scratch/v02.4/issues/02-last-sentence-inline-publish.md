# 02: 末句直发——最后一句的「下一句」变为「定稿发布」

**What to build:** 统一校对页的句间导航：在**最后一句**时，「下一句 ›」按钮替换为「定稿发布」：
- 全部句子 `proofread === "confirmed"` → 按钮亮起，点击 POST `/api/drafts/[id]/publish`（带 `window.confirm` 确认）；成功后页面进入既有的已发布守卫态，并在该守卫卡上加「去练习 →」链接（`/units/[draft.id]`）
- 仍有未确认句子 → 按钮置灰，title/下方提示「还有 N 句未确认」
- 非最后一句时「下一句 ›」照旧
- 发布失败（如 422）→ actionError/banner 显示服务端信息

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

## 实现要点

- 只改 `src/app/(shell)/drafts/[id]/proofread/page.tsx` 的导航行与已发布守卫卡；不改 API
- 发布成功后：`setDraft({...draft, status: "published"})` 触发既有守卫渲染（「这份内容已定稿发布」），守卫卡加「去练习 →」主按钮（`/units/${draft.id}`，内容 id 即草稿 id 契约）
- 422 响应带 issues → 拼进行动错误文案（如「第 3 句：还未确认」），不用逐条弹窗

## 验收

- [x] 最后一句且全部确认 → 「定稿发布」亮起，点击确认后发布成功、页面显示已发布态 + 去练习
- [x] 中间句的「下一句」不受影响；未全确认时发布按钮置灰并显示剩余数
- [x] npm test / typecheck 全绿（基线 398）
