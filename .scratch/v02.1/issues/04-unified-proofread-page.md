# 04: 统一校对页（文本 + 时点，每句一屏）

**What to build:** 把「文本校对页」与「切点校对页」合并为一个**校对页**：每屏一句——上方视频（高度受限）+ 下方当前句卡片（文本编辑、时点 ±0.25s 微调、拆分/合并/删除、确认本句），整屏无需滚动；切点页路由退役。

设计动机（用户确认）：时点校对依赖句子结构定型——先改结构（文本/拆/合/删）再调时间，否则拆/合会毁掉已调好的时间。单页每句一屏 + 「任何改动即回到未确认」在机制上保证这个顺序，不需要硬锁步骤。

**Blocked by:** 02（StandardAdminClient.tsx 文件重叠，先合 02）, 03（依赖 insert 端点与确认语义）

**Status:** ready-for-agent

## 页面结构（桌面与 iPad 竖屏 768px 均一屏）

改造 `src/app/(shell)/drafts/[id]/proofread/page.tsx`（路由不变）：

```
┌──────────────────────────────┐
│ ‹ 返回详情        进度 x/y 句已确认 │
├──────────────────────────────┤
│        ▶ 视频播放器            │ ← 高度受限（约 40% 视口），播当前句片段
├──────────────────────────────┤
│ 第 N 句              [▶ 播本句] │
│ ┌──────────────────────────┐ │
│ │ 可编辑文本（即时保存）        │ │
│ └──────────────────────────┘ │
│ 起 0:00.0 (−)(+)  止 0:05.1 (−)(+) │ ← ±0.25s，即时保存
│ [＋新增一句] [并入上一句] [与下一句合并] [删除] │
│          [ ✓ 确认本句 ]        │
├──────────────────────────────┤
│    [‹ 上一句]      [下一句 ›]   │
└──────────────────────────────┘
```

## 复用与实现要点

- 视频片段播放：seek 到 startMs 播、到 endMs 停（原 proofread 页与 cutpoint 页各有一套，合并取一，组件可放 `src/components/proofread/`）
- 文本即时保存：复用 `src/components/shared/use-draft-save.ts`
- 时点微调：复用 `src/lib/domain/calibrate.ts` 的 `adjustBoundsMs` / `MIN_CLIP_MS`（200ms）/ `CALIBRATE_STEP_MS`（250）；起 ≥0、end > start、终 ≤ 视频时长钳制在前端，服务端校验兜底
- 时点保存走既有 `PUT /api/drafts/[id]/sentences/[index]`（body `{ startMs, endMs }`）
- 「新增一句」调 03 的 `POST .../sentences/[index]/insert`（时间占位，文本就地为空可编辑）
- 「并入上一句」调既有 `POST .../sentences/[index-1]/merge`（第 1 句时按钮禁用）；「与下一句合并」调既有 `POST .../sentences/[index]/merge`（最后一句禁用）；「删除」调既有 DELETE（仅剩 1 句禁用）
- 「确认本句」调既有 `PUT ...`（body `{ text: 当前文本, confirm: true }`，confirm 需伴随至少一个其他字段是既有端点约束）
- 结构性操作（insert/merge/delete）返回整个 sentences 数组，直接整体刷新本地状态与序号

## 发布门槛（UI 侧）

- `custom/[id]` 详情页与 `admin/standard` 草稿列表的「定稿发布」按钮：仅当该草稿全部句子 `proofread === "confirmed"` 才亮起；未满足时置灰并显示「还有 N 句未确认」（服务端 422 门槛是 03 号票，双保险）
- 草稿列表可顺带显示确认进度（x/y）

## 退役切点页

- 删除 `src/app/(shell)/drafts/[id]/cutpoint/` 路由与 `src/components/cutpoint/`
- `custom/[id]`、`admin/standard`（StandardAdminClient 的「调切点」入口）、proofread 页内部的互链全部更新为单一「去校对」；grep 全仓确认无 `/cutpoint` 残留引用

## 必须保留的既有功能（不要丢）

- **标准草稿（type=standard）的教材原文参照 + 一键采用**：句数与教材模块一致时才显示采用按钮，不一致时提示「句子已增删，请手动对照复制」（`src/components/proofread/textbook.ts` 的 textbookAligns + 既有 hint）
- standard 草稿返回 `/admin/standard`、custom 草稿返回 `/custom/[id]` 的类型化返回链接（backHref/backLabel 既有逻辑）
- 状态徽标与文案（「转写中」「未校对」等，`src/components/shared/draft-ui.ts` 的 STATUS_BADGES / formatMs）
- 草稿非 proofreading 状态时的只读提示门

## 验收

- [x] 每屏一句：视频受限高，当前句卡片与全部按钮同屏可见，桌面与 768px 竖屏无需滚动
- [x] 改文本 / 调时点，刷新或重进后仍在（即时保存）
- [x] 新增一句：插在当前句后、文本可编辑、时间按占位规则落库，两句切点可就地调准
- [x] 并入上一句 / 与下一句合并 / 删除：序号连续，受影响句回到未确认状态
- [x] 确认本句后进度 +1；全部确认后发布按钮亮起，定稿成功、内容进入练习列表
- [x] 切点路由已删除、全仓无死链；标准草稿的教材参照、采用守卫、返回链接保留
- [x] npm test / npm run typecheck / npm run build 全绿（基线以 03 合入后的数量为准，只增不减）

## Comments

- 2026-10-27 实现并浏览器端到端验证：确认→插入（自动跳新句）→改文→时点微调（命中 200ms 最短钳制属预期）→逐句确认→详情页发布按钮亮起→定稿成功。切点路由已删，全仓无残留。
