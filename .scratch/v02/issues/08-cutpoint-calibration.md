# 08: 切点校对工具改造

**What to build:** 把现有「校对模式」改造成草稿的切点校对工具：保留逐句播放与 ±0.25 秒微调，起止时间保存回草稿；支持自定义内容视频；退役"导出 JSON 发给 Claude"的一次性流程。

**Blocked by:** 05（上传与草稿）

**Status:** ready-for-agent

- [x] 微调后的起止时间保存，重进后保留
- [x] 自定义内容视频可正常播放与微调
- [x] 「导出 JSON 发给 Claude」流程不再出现
- [x] 边界钳制有效（最短片段、起点不越界）

## Comments

- 实现：新增 /drafts/[id]/cutpoint（src/app/(shell)/drafts/[id]/cutpoint/page.tsx + src/components/cutpoint/ClipCard.tsx）。逐句播放、±0.25s 微调，0.8s 防抖自动 PUT /api/drafts/[id]/sentences/[index] 保存起止（复用票 07 端点，未加新端点），切句前立即补存；custom/[id] 详情页与文本校对页互加切换入口。
- 领域：domain/calibrate 新增整数毫秒版 adjustBoundsMs（+4 测试），钳制语义与 adjustBounds 一致（起点 ≥ 0、最短片段 200ms）；前端另把终点钳在视频时长内，服务端整数/endMs>startMs 校验兜底。
- 退役：删除 (shell)/units/[id]/calibrate 路由与组件，grep 全仓无「导出 JSON / 发给 Claude」入口残留。
- 遗留（不属本票领地）：units/[id]/page.tsx 第 22–24 行仍有「🔧 校对模式」链接指向已删除的 /units/[id]/calibrate（该文件是 10 号票领地，本票不动），需在 10 号票合并或集成时顺手删掉这三行，否则点进去 404。
- 前三条验收的真机点播（iPad 竖屏）留人工验收。
