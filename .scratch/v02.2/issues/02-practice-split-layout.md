# 02: 练习页左右分栏布局（视频列稳定，出分不再挤压视频）

**What to build:** 把跟读练习页（`src/app/(shell)/units/[id]/page.tsx` 外壳 + `PracticeFlow.tsx`）改为**左右分栏**：左列 = 视频常驻（REC 角标叠加其上，列内垂直水平居中，黑底 object-contain，竖版占满高度）；右列 = 固定宽度、独立滚动，内含：句子导航 chips、三大控制按钮（上一句/暂停·再读/下一句）、主卡（当前句文本、各阶段状态与按钮：示范播放中/录音控制/评分中/出分鼓励语与星级/听我读的/再练一次/开始按钮/收尾总结）、会话过期提示。

解决两个痛点：① 上下结构下操作区拥挤；② 出分鼓励语（Excellent!/Good…）出现时视频骤缩——新布局下鼓励语与星级全部在右列渲染，**左列视频尺寸恒定**。

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

## 实现要点

- `page.tsx` 外壳从 `mx-auto flex h-[100dvh] max-w-xl flex-col overflow-hidden px-5 py-2` 改为 `flex h-[100dvh] overflow-hidden`（保留 currentAccountId / ownedContentDetail / sourceLabel 数据逻辑不动）
- `PracticeFlow.tsx` 根容器改 `flex min-h-0 flex-1 flex-row`：
  - 左列 `relative flex min-w-0 flex-1 items-center justify-center bg-black`：video `max-h-full max-w-full object-contain`；REC 角标 absolute 照旧叠加
  - 右列 `flex h-full w-[26rem] shrink-0 flex-col gap-3 overflow-y-auto border-l border-slate-200 bg-slate-50 p-4`：按序放句子导航 chips（紧凑化，如 grid-cols-7 保持既有样式）、三大控制按钮、主卡、开始按钮、finished 总结卡
- **状态机、录音、提交、评分、出分倒计时、鼓励语音频、听我读的、跳句等全部逻辑零改动**——只重排 JSX 容器；practice-flow.ts 不动
- 出分展示（praiseText、score/stars、新纪录、倒计时）全部渲染在右列主卡内

## 验收

- [x] 1200px 桌面与 768px 竖屏：左右分栏、视频列恒定尺寸、右列独立滚动、整页无纵向滚动条
- [x] 完整流程不回归：开始 → 示范 → 录音 → 读好了 → 出分（含鼓励语）→ 自动下一句 → 收尾总结；REC 角标在视频上
- [x] 出分瞬间视频列尺寸无任何变化（左右列各管各的）
- [x] npm test / npm run typecheck 全绿（基线 398）
