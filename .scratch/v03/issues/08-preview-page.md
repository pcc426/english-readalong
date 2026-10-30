# 08: 预览页：PracticeFlow preview 模式 + 草稿组装不落盘

**What to build:** spec §预览 + 原型练习页右栏结构（票 11 的重排在正式 PracticeFlow 上落地，本票依赖其可参数化；若票 11 先做，本票在重排后的组件上加 preview）。新增路由 `src/app/(shell)/drafts/[id]/preview/page.tsx`。

1. **PracticeFlow 参数化**（`src/app/(shell)/units/[id]/PracticeFlow.tsx`）：加 prop `mode?: "practice" | "preview"`（默认 practice，正式练习行为零变化）。preview 模式：
   - 不调用 getUserMedia、不录音、不出现 recording/submitting 步、不提交 /api/units/[id]/practice（状态机需要无录音分支：示范播完停在该句，提供「🔁 再播一遍」、上一句/下一句）
   - 不播鼓励语音、不显示分数/星星出分视图；句子卡始终显示当前句文本
   - 顶部（右栏标题区）显示「预览模式」标记 + 提示小字：`仅供检查句子切分，不会录音、不会评分`（用户明确要求 info 提示）
   - 返回链接回校对页而不是首页；底部操作区换成【← 退回校对】（链接 /drafts/{id}/proofread）与【定稿发布】
   - 听我读按钮在 preview 中不渲染
2. **服务端组装**：预览页是 server component，鉴权取 draft（本人；标准草稿限管理员，沿用现有草稿鉴权），用草稿句子构建 ContentDetail 形状：`{ id, title: draft.title, video: draft.videoUrl（已是 /api/media 鉴权 URL）, sentences: draftSentences.map(ms→0.1s 秒，复用/抽出 finalize 的换算), bestScore/bestAt: null }`；标准草稿带上课文名/枚举串（若票 02/03 已落，用其生成器；否则仅 title）。**不写内容包文件**。
3. 【定稿发布】：沿用现有确认弹窗文案，POST /api/drafts/{id}/publish（API 不改，ADR 0005）；成功跳转 /units/{id}（真实练习页）；422 时展示 issues（沿用校对页现有拼 banner 逻辑）。
4. 预览入口要求全部句子 confirmed 才可用（入口按钮 disabled 逻辑见票 09）；直接访问 URL 时若有未确认句，页面顶部黄色提示「还有 N 句未确认，可预览但不能定稿」，定稿按钮 disabled。
5. 预览页布局：左视频 + 右栏，与练习页同一套两栏容器；视频是草稿原视频（媒体路由不查草稿状态，已可播）。

**Blocked by:** 11（PracticeFlow 先重排参数化更顺；若并行需约定 mode prop 形状）

**Status:** ready-for-agent

## 实现要点

- practice-flow.ts 状态机加 preview 分支时保持纯函数特性，补状态机单测（clipEnded in preview → paused/stopped，不进 recording）
- 评分相关 props/effect 必须在 preview 下整体短路，不能只是隐藏 UI（确保不发麦克风权限请求）
- PracticeFlow 现有硬编码 /api/units 提交与「‹ 单元列表」通过 props/参数注入，不搞第二个练习组件
- 预览页同样适合 iPad 横屏（右栏 26rem 现状保留）

## 验收

- [ ] 校对全部确认后进入预览：播放示范、逐句、重播正常；浏览器无麦克风权限弹窗；网络面板无 practice/评分请求
- [ ] 预览中改 URL/点退回校对回校对页；点定稿发布走确认→成功后进真实练习页，内容出现在教材/自定义列表
- [ ] 有未确认句时直接访问预览 URL：提示出现且定稿按钮禁用
- [ ] 标准草稿（管理员）与自定义草稿（家长）预览都可用
- [ ] practice 模式回归：正式练习录音/评分/鼓励语音/听我读/5 秒跳转全部不变
- [ ] 状态机与组件单测；npm test / typecheck / build 全绿
