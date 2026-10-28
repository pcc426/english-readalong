# 01: Bug 修复——管理页移入壳，侧边栏/TopNav 不再消失

**What to build:** 用户反馈：从侧边栏点「管理」进入 `/admin` 后，左侧菜单和顶部栏全部消失，无法回首页或上一页，只能用浏览器返回。根因：页面文件 `src/app/admin/page.tsx` 在 `(shell)` 路由组外，是 V0.2 时刻意做的独立全屏页（文件头注释可证），而子页面 `/admin/standard` 反而在壳内。

修法（URL 不变）：

1. `git mv src/app/admin/page.tsx "src/app/(shell)/admin/page.tsx"`（与既有 `(shell)/admin/standard/` 同目录），删除空的旧 `src/app/admin/` 目录
2. 去掉页面自带的 `<main className="flex min-h-screen flex-col items-center justify-center ...">` 全屏居中包装，改为壳内普通容器（如 `<div className="mx-auto max-w-5xl px-6 py-8">`）；壳的 layout 已渲染 `<main>`，页面内不得再有第二个 `<main>`
3. loading / denied / allowed 三态与 `/api/auth/me` 的 isAdmin 判定全部保留（壳只兜底未登录跳 `/login`，非管理员的拦截仍靠本页的「无权限」卡）
4. 布局类名其余暂不动（Hero+卡片改版留给票 02），只需保证移动后在壳内不破版、无横向滚动

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

## 实现要点

- 表单组件（`AccountForm` / `CreateAccountForm` / `ResetPasswordForm`）、`postAdmin`、校验 import 一律不动
- 同步更新文件头注释：删去「独立页面，不走侧边栏壳」的过时说明，改为记录「V0.2.5 移入壳，修复侧边栏消失」
- Sidebar 的「管理」项 `startsWith("/admin")` 高亮无需改；确认 `/admin/standard` 里 `<a href="/admin">` 返回链仍有效（URL 未变，应零改动）
- 检查无其他文件 import 该页面路径（页面文件不会被 import，预期只有删除目录这一步）

## 验收

- [x] 从侧边栏点「管理」：侧边栏 + TopNav 仍在；可直接点「教材内容」「自定义内容」离开，不用浏览器返回；☰ 折叠/展开正常
- [x] 侧边栏「管理」在 `/admin` 与 `/admin/standard` 都高亮
- [x] URL 仍是 `/admin`；未登录访问跳 `/login`；登录的非管理员看到「无权限」卡（侧栏无「管理」项）；管理员看到原有三卡内容
- [x] 创建账号 / 重置密码两表单功能不变（浏览器实测各一次成功提交）
- [x] 从 `/admin/standard` 点返回链接回到 `/admin` 正常
- [x] npm test（基线 410 只增不减）/ typecheck / build 全绿

## Comments

- 2026-10-28 实施：commit 5900918（`git mv` 进 `(shell)`，外层 main→div、loading/denied 独立居中容器）；浏览器实测全部通过（临时管理员账号验收后已删）。
