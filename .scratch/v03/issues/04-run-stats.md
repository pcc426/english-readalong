# 04: 练习 run 归属与「最近一次总星数」统计

**What to build:** 教材卡片要显示最近一次练习获得的总星星数（spec 决策 23–25），取代四个分布胶囊。现状 practice_attempts 只有每句最佳，没有「一次练习」的归属。

1. DB（src/lib/db.ts 沿用 addColumnIfMissing 模式）：practice_attempts 加可空列 `run_id TEXT`（老数据为 NULL）。
2. PracticeFlow：mount 时生成一个 runId（`crypto.randomUUID()`）；finished 后点「再练一遍」整体重开时**生成新 runId**（用户说的一次练习＝begin→结束/中途退出的一轮；据状态机：replay/remount 算新一轮）。
3. 评分提交 /api/units/[id]/practice body 增加可选 `runId`（缺省按 NULL 处理，兼容性：旧客户端/测试不填不炸）；attempts 写入时落 run_id。
4. 统计函数（src/lib/domain/stats.ts 或新模块）：
   - `latestRunStars(unitId, owner)`：该账号该内容**最近一个 run 的 stars 之和**（按该 run 内每条 attempt 的 stars 快照列；同句多次提交取该 run 内最高分，避免重读同句重复计）
   - 注意：中途退出的 run 也算最近一次；老数据 run_id NULL 的行不参与（卡片显示「还没练过」合适吗？——不合适：有 NULL 行说明练过。处理：没有任何非 NULL run 时，回退显示每句最佳星之和，标注同「上次练习获得」；实现时写进该函数注释）
   - 聚合进 ContentOverview/owned-content overview（与 best-per-sentence 查询同批或独立批量查全部可见内容）
5. 前端显示见票 05/06（星数 24px 🌟N + 「上次练习获得」）。本票只做数据与 API。

**Blocked by:** None

**Status:** ready-for-agent

## 实现要点

- 现有 best-per-sentence 统计（stats.ts:33-57）不动；总星数是新增聚合，不是替换它（练习页句格还用每句最佳）
- runId 不新建 sessions 表——个人项目不过度设计；一列即可
- 一个 run 跨句子导航选句练习都算同一 run（同一 mount）；PracticeFlow key 变化即新 run
- 鼓励语音、出分逻辑零改动

## 验收

- [ ] 完整练一轮后卡片显示该轮 🌟 总和；马上第二轮只练 1 句退出，卡片显示第二轮的 1 句星数（最近 run 口径）
- [ ] 同一句一轮内练 3 次取最高计入一次
- [ ] 只有老数据（run_id NULL）的内容回退显示每句最佳星之和
- [ ] runId 缺省请求评分 200 成功
- [ ] 单元测试覆盖 latestRunStars：多个 run、未完成 run、同句重复、NULL 回退
- [ ] npm test / typecheck / build 全绿

## Comments

- 2026-10-30 实施：commit 3e66545（合入 08a1064）；浏览器实测（v03，1024×768）：插入一轮 3 句（3+2+3 星）后首页卡片显示 🌟8（24px）与「上次练习获得」；未练内容显示「还没练过」。多 run / 同句最高 / NULL 回退均有单测。
- 2026-10-30 code-review 修复：commit 234c27c（迁移/补抽实跑、预览副标题接线、预览门槛三处统一、saving 即时、文案与术语、注册表查找与媒体 URL 收敛、GLOSSARY 补 run 词条）。
