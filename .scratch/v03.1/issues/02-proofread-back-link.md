# 02: 自定义草稿校对页返回新列表

**What to build:** 自定义草稿校对页顶部的「← 返回内容详情」跳到 `/custom/{id}`（V0.2 单列详情页），应回到 V0.3 的新列表（tabs + 网格）。

`src/app/(shell)/drafts/[id]/proofread/page.tsx` 的 `backHref` / `backLabel`：

| 草稿类型 | href | 文案 |
|---|---|---|
| standard | `/admin/standard`（不变） | `← 返回标准内容制作`（不变） |
| custom | `/custom?tab=making`（改） | `← 返回自定义内容`（改） |
| 草稿未加载 | `/custom`（不变） | `← 返回自定义内容`（不变） |

**Blocked by:** None

**Status:** ready-for-agent

## 实现要点

- 自定义草稿一定处于 transcribing/proofreading，落在「制作中」tab，所以带 `?tab=making`
- 不改 `/custom/{id}` 详情页本身（它仍是草稿详情页，从列表卡片「去校对」链过去）

## 验收

- [ ] 自定义草稿校对页点返回：到 `/custom?tab=making`，列表高亮「制作中」
- [ ] 标准草稿校对页返回：仍到 `/admin/standard`
- [ ] npm test / typecheck / build 全绿；浏览器实测

## Comments

- 2026-11-02 实施并验收（v0.3.1）：自定义草稿返回链接改为 /custom?tab=making、文案「← 返回自定义内容」；标准草稿仍回 /admin/standard。浏览器实测两种草稿各一次。 全量 588 测试通过（v0.3 基线 577 + 11），typecheck / build 绿。
