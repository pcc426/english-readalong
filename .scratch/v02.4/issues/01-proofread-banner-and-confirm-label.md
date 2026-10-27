# 01: 校对页提示收敛 + 确认按钮文案 + 右列加宽

**What to build:** 统一校对页（`src/app/(shell)/drafts/[id]/proofread/page.tsx`）三处收拾：

1. **确认按钮文案**：确认后显示「本句已确认 ✓」，去掉「（再改动会回到未确认）」括号说明
2. **提示收敛为一个 banner**：右栏顶部固定一个 banner 槽位，以下信息只显示最新的一条（互斥），卡片头部/底部的散落提示全部移除：
   - actionError（操作失败）→ error 红
   - 当前句保存态 error「保存失败，请重试」→ error 红
   - 当前句保存态 saving「保存中…」/ saved「已保存 ✓」→ 灰/绿
   - standard 且教材加载失败「教材原文加载失败，可直接手工校对」→ error
   - standard 且句数与教材不对齐「句子已增删，请手动对照复制」→ info
   派生优先级：actionError > 保存 error > saving/saved > 教材加载失败 > 不对齐提示；无消息时渲染等高空占位（避免布局跳动）
3. **右列加宽**：`w-[26rem]` → `w-[30rem]`（视频标题显示不全的问题随之缓解）

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

## 约束

- 只改 `src/app/(shell)/drafts/[id]/proofread/page.tsx`；逻辑零改动（saveStates/textbook/actionError 的产生方式不变，只是展示位置收敛）
- 确认进度行（已确认 x / y 句）保留在标题旁，不是 banner 的一部分

## 验收

- [x] 改文本 → banner 显示「保存中…→已保存 ✓」；操作失败 → banner 红色错误；standard 不对齐 → banner 提示；同一时刻只有一条
- [x] 确认按钮无括号说明
- [x] 右列 30rem、视频标题不再截断（1200px 桌面）
- [x] npm test / typecheck 全绿（基线 398）
