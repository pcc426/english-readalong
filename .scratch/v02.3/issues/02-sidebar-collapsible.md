# 02: 壳侧边栏可折叠

**What to build:** app 左侧导航栏（`src/components/shell/Sidebar.tsx`，教材内容/自定义内容/管理）加折叠开关：折叠后整条隐藏、内容区占满全宽（校对页/练习页的右操作列因此获得更多空间）；再点开关展开。折叠状态持久化到 `localStorage`（key `sidebar-collapsed`，"1"=折叠）。

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

## 实现要点

- `src/app/(shell)/layout.tsx`：加 `collapsed` state（初始 false，挂载后从 localStorage 读回）；`{!collapsed && <Sidebar …/>}`；把 `collapsed` 与切换函数传给 TopNav
- `src/components/shell/TopNav.tsx`：头部左侧加 ☰ 切换按钮（`aria-label="收起/展开菜单"`），其余（邮箱/退出）不动
- 顺带布局修正：练习页 `src/app/(shell)/units/[id]/page.tsx` 外壳与统一校对页根容器的 `h-[100dvh]` 改 `h-full`（壳内 main 已扣除 TopNav，100dvh 溢出）——校对页部分若票 01 已做则不重复
- 不改导航项/权限逻辑（isAdmin 判定保留）；不加依赖

## 验收

- [ ] 点 ☰ 折叠：侧边栏隐藏、内容区变宽；再点展开；刷新后记住状态
- [ ] 校对页/练习页在折叠与展开两种状态下均无纵向滚动条、布局不破
- [ ] 导航功能不变（三个入口、管理员可见「管理」）
- [ ] npm test / typecheck 全绿（基线 398）
