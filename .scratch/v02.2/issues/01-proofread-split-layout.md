# 01: 统一校对页左右分栏布局

**What to build:** 把统一校对页（V0.2.1 票 04 产物）从上下结构改为**左右分栏**：左列 = 视频常驻（竖版视频可占满整列高度，横版兼容，黑色背景 object-contain）；右列 = 固定宽度、独立滚动（`overflow-y-auto`），内含头部（返回链接 + 「未校对」徽标 + 确认进度）、当前句卡片（序号/确认徽标/播放本句/可编辑文本/教材原文参照/时点显示与 ±0.25s 四按钮/新增一句/并入上一句/与下一句合并/删除/确认本句）、上一句/下一句导航。

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

## 实现要点

- 只改 `src/app/(shell)/drafts/[id]/proofread/page.tsx` 的**返回 JSX 结构与根容器**；V0.2.1 票 04 的全部逻辑（加载、useSentenceSave、insert/merge-prev/merge-next/delete/confirm/adopt/adjust、backHref/backLabel、只读态守卫）原样保留，不得增删行为
- 根容器 `flex h-[100dvh] overflow-hidden`（去掉 `mx-auto max-w-2xl`）；左列 `flex min-w-0 flex-1 flex-col items-center justify-center bg-black p-2`，video `max-h-full max-w-full object-contain`；右列 `flex h-full w-[26rem] shrink-0 flex-col gap-3 overflow-y-auto border-l border-slate-200 bg-slate-50 p-4`
- 播放本句/停止按钮、确认按钮、保存三态提示等交互与文案保持不变；视频上的 timeupdate 停播逻辑不变
- 结构性操作（insert/merge/delete）后导航位置钳制逻辑不变（`applySentences` + position 钳制）
- 右列内卡片若超出高度由右列自身滚动，整页不出现纵向滚动条

## 验收

- [x] 1200px 桌面与 768px 竖屏：左右分栏、视频列大、右列独立滚动、整页无纵向滚动条
- [x] 确认→插入→拆分→微调→全确认→发布 全流程不受布局改动影响（手工走查）
- [x] standard 草稿的教材原文参照与采用守卫、custom/standard 差异化返回链接保留
- [x] npm test / npm run typecheck 全绿（基线 398）
