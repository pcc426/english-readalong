# 01: 校对页「设为播放位置」+ 时点按钮组重排

**What to build:** 统一校对页（`src/app/(shell)/drafts/[id]/proofread/page.tsx`）两点增强：

1. **视频自由播放**：video 元素加 `controls`（原生拖动/播放/暂停），家长可自由 scrub 到想要的位置。既有的「▶ 播放本句」片段模式保留（timeupdate 到句尾自动停的逻辑只在片段模式 `playing` 时生效，自由播放不受影响）。
2. **「设为播放位」**：起点行、终点行各加一个按钮，点击把该句的 startMs / endMs 设为 `Math.round(video.currentTime * 1000)`，并做钳制后防抖保存：
   - 设起点：`start = max(0, min(ms, endMs - MIN_CLIP_MS))`（保证 end > start 且最短 200ms）
   - 设终点：`end = max(start + MIN_CLIP_MS, ms)`；若视频时长已知，`end = min(end, 视频时长毫秒)`
   - 钳制后过 `scheduleSave(index)`；按钮 title 提示「以视频当前播放位置为准」

3. **时点控制重排**：去掉居中的大号时间显示行与 2×2 四按钮网格，改为两行、每行内联：
   - 起点：`起点` 标签 + 当前值（formatMs，tabular-nums）+ `−0.25s` + `＋0.25s` + `设为播放位`
   - 终点：同构
4. 顺带布局修正：页根容器 `h-[100dvh]` 改 `h-full`（壳内 main 已扣除 TopNav 高度，100dvh 会溢出）。

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

## 文件与约束

- 只改 `src/app/(shell)/drafts/[id]/proofread/page.tsx`；逻辑（useSentenceSave、insert/merge/delete/confirm/adopt、教材守卫、返回链接）零改动
- 钳制常量复用 `MIN_CLIP_MS`（200ms）；不加依赖；不改 API
- 按钮文案：微调按钮保持「起点 −0.25s / 起点 ＋0.25s / 终点 −0.25s / 终点 ＋0.25s」风格；新按钮「设为起点」「设为终点」

## 验收

- [ ] 自由拖动视频到任意位置暂停 → 点「设为起点」/「设为终点」→ 值生效并自动保存，刷新后保留
- [ ] 设起点若与终点冲突（≥ 终点）被钳制到 终点−200ms；设终点同理
- [ ] 「▶ 播放本句」片段模式到句尾自动停的行为不变
- [ ] 页面无纵向滚动条（h-full 修正后）；npm test / typecheck 全绿（基线 398）
