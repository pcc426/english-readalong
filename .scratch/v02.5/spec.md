Status: ready-for-agent

# Spec: V0.2.5 管理页收尾（进壳修侧边栏消失 / Hero+卡片改版）

用户 2026-10-27 验收通过 V0.2.4 后，对管理页（`/admin`）提了两项。本迭代纯前端，不动任何 API 与表单提交逻辑。

## 现状

- `/admin` 的页面文件是 `src/app/admin/page.tsx`，位于 `(shell)` 路由组**之外**，是自带 `<main className="min-h-screen">` 的独立全屏页，刻意不渲染 Sidebar/TopNav（文件头注释写明 V0.2 票 02 的当时决定：「独立页面，不走侧边栏壳」）。
- `/admin/standard` 反而在壳内（`src/app/(shell)/admin/standard/`）。
- 管理页现有内容：标题「管理」+ 两个表单卡（创建家长账号、重置密码，`md:flex-row` 并排）+ 下方一张「标准内容制作」卡（`max-w-md`）。三卡宽度不一、高度参差。

## 决定

1. **Bug：进管理页后侧边栏消失**（票 01）。修法是把页面移入壳路由组：`src/app/admin/page.tsx` → `src/app/(shell)/admin/page.tsx`，URL `/admin` 不变（路由组不影响 URL），旧空目录删除。
   - 页面自带的全屏 `<main>` 包装去掉（壳的 layout 已包了一层 `<main>`，嵌套 `<main>` 是非法 HTML）；loading / 无权限 / 管理内容三种态保留，改为壳内普通容器。
   - 壳层已负责「未登录跳 /login」；页面保留自己的 `/api/auth/me` isAdmin 门禁与「无权限」卡（非管理员直接访问 URL 时仍要拦住），登录与权限行为不变。
   - Sidebar 现有 `startsWith("/admin")` 高亮逻辑天然覆盖 `/admin` 与 `/admin/standard`；`/admin/standard` 顶部返回 `/admin` 的链接不动。
2. **管理页改版：主次 Hero + 下方卡片（原型 B 中选）**（票 02）。2026-10-28 用一次性原型（分支 `prototype/admin-grid`，commit 84fd904，路由 `/prototype/admin-grid?variant=A|B|C`）比了三个结构方案，用户选定 **B**：
   - **标准内容制作**做成通栏 emerald hero 卡（emerald-50 底、emerald-100 ring、左标题+说明、右侧主按钮），永远是页面第一项、视觉主任务
   - **创建家长账号 / 重置密码**两张白卡在 hero 下方 `md:grid-cols-2` 同行，卡等高、按钮基线对齐
   - **扩展性（用户明确要求）**：后续管理员新功能就在本页以**普通白卡向下堆叠**追加（hero 之下、与账号卡同样式），不进 hero、不挤进行内
   - 否决的方案：A 三列等高卡（内容制作与低频表单同权，且未来卡片数不是 3 的倍数会留空位）；C 左侧分段设置面板（多一次点击，功能少时过重）
   - 两表单字段、校验、提交端点、反馈文案零改动，只改布局；`lg` 三列断点随之作废，B 只用 `md` 两列

## 明确不做

- 不改任何 `/api/admin/*` 与表单逻辑/文案
- 不改 `/admin/standard` 页面本身
- 不做卡片拖拽排序、不增删卡片
- 不新增前端自动化测试（沿用既有约定：UI 走手工/浏览器验收，测试只要求不减少）

## 票

- 票 01：管理页移入壳，修复侧边栏/TopNav 消失（bug 修复，先做）
- 票 02：管理页 Hero + 下方卡片改版（Blocked by 01，改的是同一个文件移动后的布局）

## 原型

一次性原型在分支 `prototype/admin-grid`（commit 84fd904，**不合 main**），路由 `/prototype/admin-grid?variant=A|B|C`，悬浮条切换。中选 **B**。实施票 02 时按 B 重写，不从原型直接抄（原型代码是无测试、无鉴权的 throwaway 质量）。

## 基线

410 测试全绿（2026-10-27 main 实测）；每票只增不减；typecheck + build 必须通过。验收在 1200px 桌面浏览器点击实测（沿用项目 UI 不做自动化测试的约定）。
