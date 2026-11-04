# 01: 三个列表页卡片 holder 加宽、压扁

**What to build:** 纯样式改动（spec §1）。三个列表页统一：容器 max-w-6xl、网格 minmax(180px,1fr)、封面 aspect-[3/4]。

| 文件 | 改动 |
|---|---|
| `src/app/(shell)/page.tsx` | max-w-7xl → max-w-6xl；minmax(168px) → (180px)；aspect-[9/16] → [3/4] |
| `src/app/(shell)/custom/page.tsx` | 同上（cover() 与 transcribing 占位 div 的 aspect） |
| `src/app/(shell)/admin/standard/StandardDraftList.tsx` | 仅 aspect 改 [3/4]（容器与 minmax 已是目标值） |

**Blocked by:** None

**Status:** ready-for-agent

## 验收

- [x] 1024×768 下三个页面一行 4–5 卡、整行完整可见
- [x] 卡内所有内容（徽标/标题/枚举串/进度条/星数/按钮）一个不少
- [x] npm test / typecheck / build 全绿

## Comments

- 2026-11-04 实施并验收（v0.3.5）：三文件按表落实。实测 1024×768（真实数据）：教材首页一行 4 卡（卡宽 ~186px，封面 3:4 高 ~140px，卡总高 ~370px，整行含筛选器在 768 高一屏完整可见）；自定义列表同；教材制作列表同。功能与内容零变化（603 测试全绿）。

## Comments

- 2026-11-04 实施并验收（v0.3.5）：三文件落实。1024×768 实测（临时库副本 + 真实数据）：教材首页 4 列、卡宽 180 / 卡高 396 / 封面高 240（原 9:16 时 ~320），整行 bottom 634 < 768 一屏完整可见；自定义列表同参数（卡高 357）；教材制作列表 aspect 已同步 3:4。603 测试全绿。
