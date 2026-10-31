# 05: 教材内容首页改版：紧凑自适应网格 + 单元/模块筛选 + 总星数卡

**What to build:** 原型 `src/app/prototype/home/page.tsx` 变体 A（用户已确认）。注意首页就是壳首页 `src/app/(shell)/page.tsx`（不存在 /units 列表页，侧栏「教材内容」→ `/`）。

页面结构：

1. 容器改 `mx-auto max-w-7xl`（现 max-w-xl 单列）。
2. 顶部工具条白卡：单元下拉（全部/Unit 1…10 带单元英文标题）＋ 模块下拉（全部/六栏目）；模块选项随单元联动——选了单元只列该单元实际存在的模块，「全部模块」保留；不选单元时模块筛选跨所有单元。右侧「N 个内容」计数。筛选全在客户端做（overview 已含全部标准内容；需在 overview 视图加 unitNo/moduleKind/lessonTitle/poster/latestStars 字段，依赖票 03/04/01）。
3. 网格：`grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(168px,1fr))]`——原型实测 375px→1 列、1024px→4 列、1440px→6 列。不写死列数。
4. 卡片（参照原型 ContentCard，正式实现重写）：
   - 顶部 9:16 封面图（object-cover；无封面用占位）
   - 「标准」标签必须 `shrink-0 whitespace-nowrap`（修复评审发现的有时竖排问题）
   卡文区域 p-3：主标题＝课文名 text-base font-bold；副标题＝枚举串 text-xs slate-500（票 03 的 standardEnumSubtitle）
   - 分隔线下方：有星数显示 24px font-extrabold `🌟N`（无空格，原型确认）+「上次练习获得」11px 注释；未练 `还没练过` 12px slate-400；鼓励语 praise 保留在右侧 text-xs emerald 加粗
   - 整卡链接练习页 /units/[id]（不变）
5. 排序：按 spec 决策 18/票 03——单元序号 → 模块在教材 JSON 的顺序；筛选状态下保持该序。
6. 空态：筛选无结果显示白卡「这个筛选条件下还没有内容」。

**Blocked by:** 01, 03, 04

**Status:** ready-for-agent

## 实现要点

- 现有的四个星级分布胶囊（page.tsx:98-107）删除，被 latestStars 取代；STAR_LABELS 相关代码若再无引用一并清理
- sourceLabel 在标准卡不再展示（枚举串就是来源）；注意运行时标准包 source="standard-upload"
- 封面 URL 走鉴权 /api/media 改写（owned-content 对 poster 同样改写）
- 原型在 `src/app/prototype/` 是 throwaway，本票实现完成后不保留进 main（或随原型清理票统一处理）

## 验收

- [ ] 24 个五上模块内容按教材序排列；选 Unit 2 时模块下拉只有 Talking time/Story time，卡片区 2 张
- [ ] 不选单元选 Chant time → 只出现 U3 Parts of plants
- [ ] 1024×768（iPad 横屏）4 列、1440 宽 6 列、375 宽 1 列；「标准」标签全部横向不竖排
- [ ] 练一轮后卡片显示该轮 🌟 总和与「上次练习获得」；新内容显示「还没练过」
- [ ] 封面比例正确无拉伸；无封面环境显示占位不裂图
- [ ] npm test / typecheck / build 全绿；浏览器实测各筛选组合

## Comments

- 2026-10-30 实施：commit 20b1ed2（合入 70dadc8）；浏览器实测（v03，1024×768）：1024×768 下 4 列；封面渲染 180×320（9:16，原图 360 宽）；「标准」徽标 45×24 横向不换行；选 Unit 3 后仅 2 张卡、模块下拉收窄为 Chant time/Reading time；网格 repeat(auto-fill,minmax(168px,1fr))。
- 2026-10-30 code-review 修复：commit 234c27c（迁移/补抽实跑、预览副标题接线、预览门槛三处统一、saving 即时、文案与术语、注册表查找与媒体 URL 收敛、GLOSSARY 补 run 词条）。
