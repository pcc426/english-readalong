# 02: 管理页改版——标准内容制作 Hero + 下方账号卡（未来功能向下堆叠）

**What to build:** 管理页 allowed 态内容区按原型 **B** 改版（原型三方案中选，见下「原型出处」）。纯布局改动，字段、校验、提交、反馈文案零改动：

1. **Hero 卡（第一项）**：标准内容制作做成通栏 emerald hero——
   - `rounded-3xl bg-emerald-50 p-8 ring-1 ring-emerald-100`
   - 内容左右排：左侧 `<h2>标准内容制作</h2>`（text-2xl font-bold，emerald-900）+ 现有说明文案（emerald-800/80，max-w-xl）；右侧「进入标准内容制作 →」主按钮（emerald-500、`shrink-0`、`px-8 py-4 text-xl`，href `/admin/standard`）
   - `flex-col md:flex-row md:items-center md:justify-between gap-6`：窄屏堆叠、≥768px 横排
2. **账号两卡（hero 下方）**：`grid grid-cols-1 md:grid-cols-2 gap-6 mt-6`——创建家长账号、重置密码各一张白卡（沿用 `rounded-3xl bg-white p-7 shadow-md ring-1 ring-slate-100`），两卡同行等高；表单根 `flex h-full flex-col`，提交按钮 `mt-auto` 吸底，保证两按钮基线对齐；去掉表单根的 `max-w-sm`（宽度由格子决定），字段宽度仍由表单铺满
3. **扩展性约定（用户明确要求）**：容器做成「hero + 一个 `space-y-6`（或等价）的纵向卡片区」；**后续管理员新功能以同样式普通白卡整宽向下堆叠追加**，不进 hero、不挤进账号两卡那一行。本次不预置空卡位
4. 容器 `mx-auto max-w-5xl px-6 py-8`；loading / 无权限态保持票 01 后的现有居中样式，不进 hero/卡片结构

**Blocked by:** 01

**Status:** ready-for-agent

## 原型出处

一次性原型分支 `prototype/admin-grid`（commit 84fd904，不合 main）：`/prototype/admin-grid?variant=A|B|C`。
- 中选 **B**（本票）：主次分明，内容制作是高频主任务、账号表单低频靠下；且向下堆叠天然容纳未来功能
- 否决 A（三列等高）：内容制作与低频表单同权重；未来卡片数不是 3 的倍数会留空位
- 否决 C（分段面板）：多一次点击，当前仅 3 个功能、分段导航过重
- 实施时按本票重写生产代码，**不直接复制原型**（原型无鉴权门、无测试、表单是 stub）

## 实现要点

- 只改 `src/app/(shell)/admin/page.tsx`（票 01 移动后的路径）；`postAdmin` / `AccountForm` 的提交与校验不动
- `AccountForm` 只允许加最少的布局 props（如外层 className 透传），不复制组件；`Field`/`Feedback` 不动
- hero 的「进入」链接在原型里是 `<a>`，生产代码保持 `<a href="/admin/standard">` 即可（与现状一致）

## 验收

- [x] 1200px 桌面：hero 通栏在最上（左文案右按钮）；下方创建/重置两卡等宽并排、等高，提交按钮底边对齐
- [x] hero 视觉与白卡明显区分（emerald 浅底）；padding/圆角与原型 B 一致
- [x] <768px：hero 文案与按钮纵向堆叠；两账号卡单列，顺序 创建账号 → 重置密码
- [x] 点「进入标准内容制作 →」进 `/admin/standard`；两表单提交、成功/错误反馈行为与改版前一致（浏览器实测各一次成功提交）
- [x] 无权限态与加载态保持居中卡片，不显示 hero
- [x] npm test（基线 410 只增不减）/ typecheck / build 全绿

## Comments

- 2026-10-28 实施：commit e518b0d。实测数据：1200px 两卡等高 396px、两提交按钮 top/bottom 像素级一致；768px 走 md 两列（断点规格），430px hero 与两卡均纵向堆叠。
