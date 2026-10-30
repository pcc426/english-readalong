# 09: 三处发布入口收敛为【去预览】

**What to build:** ADR 0005：UI 收敛、不加服务端门禁。所有「定稿发布」动作只从预览页（票 08）发起。

1. 校对页 `src/app/(shell)/drafts/[id]/proofread/page.tsx`：末句位置底部导航的【定稿发布】按钮（:777-788 一带）改为【预览 →】链接 `/drafts/{id}/preview`；disabled 条件不变（unconfirmedCount > 0 时禁用，保留 title「还有 N 句未确认」）；删除本页 handlePublish 的直接发布调用与 422 banner（发布责任移到预览页；422 理论上预览前置条件已挡住，保留 API 不动）。published 落地视图（:523-542）保留（它处理的是发布后状态），其【去练习】链接不变。
2. `/custom/[id]` 详情页（custom/[id]/page.tsx:272-279 一带）：proofreading 态的【定稿发布】按钮改为【去预览】→ `/drafts/{id}/preview`（未全部确认时由预览页/按钮禁用处理，与校对页同条件）。该页「退回校对」等其他功能不动。
3. 管理员标准制作列表 `StandardAdminClient.tsx`（:408-416 一带）：标准草稿的【定稿发布】同样改为【去预览】；管理员账号本人即草稿 owner，预览鉴权沿用。
4. 全局 grep 确认产品 UI 中不再有任何按钮直接 POST `/publish`（API 路由本身保留，预览页使用）。

**Blocked by:** 08

**Status:** ready-for-agent

## 实现要点

- 不改 publish route 的任何服务端逻辑（ADR 0005 明确）
- 三个入口的按钮样式沿用各自原主按钮样式，仅改文案与跳转
- 校对页移除直接发布后，window.confirm 弹窗只出现在预览页一处，文案沿用现有「确定把「标题」定稿发布吗？发布后所有账号可见、可跟读。」（自定义）与标准对应文案
- 「全部确认」判定三处保持一致（proofread status 全部 confirmed）

## 验收

- [ ] 三个入口都不再能一键发布，均跳到预览页；未全部确认时入口禁用/提示
- [ ] grep 产品代码（排除原型与 API 自身）无对 publish 端点的直接 fetch
- [ ] 自定义内容与标准内容各走一遍：校对→预览→定稿发布成功
- [ ] 已发布内容的退回校对（unpublish）后再次发布仍必须经过预览
- [ ] npm test / typecheck / build 全绿；浏览器三入口实测
