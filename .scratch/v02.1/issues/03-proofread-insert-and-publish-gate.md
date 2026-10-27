# 03: 校对 API——插入句子与发布确认门槛

**What to build:** 为统一校对页（04 号票）补两个 API 侧能力，并核实既有「确认」语义。纯 API/领域层，TDD，UI 无涉。

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

## 1. 新端点：插入句子（拆分过长分句用）

`POST /api/drafts/[id]/sentences/[index]/insert`   body `{ "text"?: string }`

- 在第 index 句**之后**插入新句；成功返回**整个 sentences 数组**（与既有 merge/delete 端点返回形态一致，前端好整体刷新）
- 新句时间占位规则（毫秒）：
  - 若存在下一句且 `next.startMs > 当前句.endMs` → `[当前句.endMs, next.startMs]`
  - 否则 → `[当前句.endMs, 当前句.endMs + 250]`（保证 end > start 即可，家长随后在校对页微调；允许与下一句时间重叠，发布前的逐句校验只查 end>start 与文本非空）
- 新句文本取 `body.text`（trim 后可为空串——草稿态允许空文本，发布校验会拦）；校对状态（proofread 字段）置 `"edited"`
- 后续句序号前移逻辑与既有 merge/delete 一致（库中无空洞）
- 权限与状态语义与兄弟端点完全一致：未登录 401；非本人草稿/不存在 404（不暴露存在性）；index 越界 404 SENTENCE_NOT_FOUND；草稿非 proofreading 状态 409 DRAFT_NOT_EDITABLE
- 领域逻辑放 `src/lib/drafts/sentences.ts`（新增 `insertSentence`，参考既有 `updateSentence` / `deleteSentence` / `mergeSentenceWithNext` 的写法与测试）；路由新建 `src/app/api/drafts/[id]/sentences/[index]/insert/route.ts` + route.test.ts

## 2. 发布门槛：全部句子已确认

- `src/lib/drafts/finalize.ts` 的校验链追加一条：每句 `proofread` 字段必须为 `"confirmed"`；不满足 → 走既有 422 INVALID_DRAFT 通道，`issues` 逐句列出（`{ index, problem: "未确认" }`）
- 既有校验（每句文本非空、起止合法）全部保留
- 对应补 `finalize.test.ts` 与 `publish/route.test.ts` 用例

## 3. 核实既有确认语义（与设计不符就修，加测试锁定）

- `PUT /api/drafts/[id]/sentences/[index]` 改 text/startMs/endMs → 该句 proofread 置 `"edited"`（未确认）——应已实现，确认测试覆盖三种字段
- 既有 `POST .../sentences/[index]/merge` → 合并结果句置 `"edited"`——应已实现
- **「并入上一句」不需要新端点**：前端直接调既有 `POST /api/drafts/[id]/sentences/[index-1]/merge`（把 index-1 与 index 合并）。本票只需确认该用法语义正确（合并的是 index-1 句与 index 句）

## 验收

- [ ] insert：成功（含占位时间规则两种分支）/ 401 / 404（越界、他人草稿）/ 409（非 proofreading）均有路由测试
- [ ] insert 后序号连续、可带初始文本、空文本落库成功
- [ ] publish：存在未确认句子 → 422 且 issues 列出未确认项；全部 confirmed → 定稿通过（叠加既有校验）
- [ ] npm test / npm run typecheck 全绿（基线 382，只增不减）
