# V0.4 规格：我的成长与星星积分体系

状态：已定稿（2026-11-05），已实现（2026-11-05），待验收
关联：`.scratch/v04/grilling-decisions.md`（决策记录）；`GLOSSARY.md`（术语）；原型 A「仪表盘」仅用于评审，不作为实现基础。

## Problem Statement

当前系统的星星只存在于「每次录音的句子星」这一层：`practice_attempts` 记录每条录音的分数与 1–3 星，没有任何账号级的星星余额、按天聚合、打卡记录或成长页面。孩子练完一条内容后，除了一句鼓励语和卡片上的「上次练习获得」，看不到长期积累；家长也无法回看某个月练了哪些天、星星是怎么长起来的。

同时，如果直接按录音次数累加账号星星，孩子可以通过反复读简单内容无限刷星，激励会失真。V0.4 需要建立一套可长期使用的账号星星体系，既让努力被看见，又避免刷星，并为后续宠物成长提供稳定的总星数。

现有数据（2026-11-05）：

- 180 条练习记录，时间从 2026-10-20 到 2026-11-04。
- 两个账号：管理员 `424…`、家长测试号 `01f…`；另有 36 条 `owner` 为 NULL 的账号体系前记录。
- 大部分历史轮次并不完整（例如 6 句内容多数轮次只覆盖 1–4 句）。如果严格按「完整练习」回填，只有约 2 个打卡日，因此历史数据只折算星星，不补打卡。

## Solution

新增账号星星账本，规则为：

- 只有「完整练习」产生账号星星：同一轮练习内，内容的每一句都至少成功录音评分过一次。
- 一次完整练习的星星 = 本轮每句最高句子星之和；如果本轮三星句数达到总句数的 90%（四舍五入），整体翻倍。
- 同一内容每周最多 3 次完整练习；第 4 次起硬拦截，入口不置灰，点击弹站内提示，服务端也拒绝。
- 上线时把每个内容的历史最好星一次性折算成「初始星星」，只折算星星，不补历史打卡日。
- 账号星星只增不减；v0.4 不消耗。

新增「我的成长」一级页面作为登录后的默认首页，包含累计星星、连续打卡、月度打卡日历和当月余额曲线。月历按北京时间记录打卡日；余额曲线显示每日账户总余额。上线前的月份只显示日历和起始月份说明，不画曲线。

路由调整：`/` 改为「我的成长」；教材内容列表从 `/` 移到 `/units`；`/custom` 与 `/admin` 不变。

## User Stories

1. As a 孩子，I want to 登录后先看到自己的累计星星，so that 我知道自己已经积累了多少。
2. As a 孩子，I want to 在月历上看到哪些天完成了整条内容，so that 我可以保持连续练习。
3. As a 孩子，I want to 看到当月星星余额曲线，so that 我能感受到自己的增长。
4. As a 孩子，I want to 在完整练完一条内容后看到本次入账星星，so that 我知道这次努力换来了什么。
5. As a 孩子，I want to 在一轮表现特别好时看到「星星翻倍」的庆祝，so that 我有冲击三星的动力。
6. As a 孩子，I want to 在跳过句子、没读完整条内容时被告知这次不能累计星星，so that 我知道要补读完。
7. As a 孩子，I want to 句格继续显示每句历史最高星，so that 我能看到自己的最好成绩。
8. As a 孩子，I want to 即时评分卡显示本次录音的星和最好成绩，so that 我知道这一次读得怎么样。
9. As a 孩子，I want to 同一内容本周练满 3 次后看到友好提示，so that 我不会反复刷同一条简单内容。
10. As a 孩子，I want to 在提示里被引导去练其他内容，so that 我知道接下来可以做什么。
11. As a 家长，I want to 登录后默认进入「我的成长」，so that 孩子一进来先看到过去的成就。
12. As a 家长，I want to 历史星星被折算成初始星星，so that 孩子开始使用新版本时不是从 0 开始。
13. As a 家长，I want to 历史练习不被补成打卡日，so that 打卡记录只反映 V0.4 上线后的真实行为。
14. As a 家长，I want to 每周 3 次的上限在服务端也生效，so that 孩子不能通过刷新或旧地址绕过。
15. As a 家长，I want to 在超次数时看到站内样式的弹窗，so that 界面不出现突兀的浏览器原生弹框。
16. As a 家长，I want to 内容卡片显示最近一次完整练习的入账星，so that 卡片和成长页的口径一致。
17. As a 管理员，I want to 教材内容列表仍然可用，so that 我能在 `/units` 继续制作和检查标准内容。
18. As a 家庭账号，I want to 在教材内容关闭时仍能使用「我的成长」，so that 下架标准内容不影响孩子的历史星星和打卡。
19. As a 系统维护者，I want to 所有星星、打卡、曲线都从同一份账本计算，so that 三处口径不会漂移。
20. As a 系统维护者，I want to 初始星星回填可重复执行且不修改旧练习记录，so that 部署和回滚都安全。
21. As a 系统维护者，I want to 日/周/月边界固定按北京时间，so that 服务器时区变化不会改变打卡结果。
22. As a 系统维护者，I want to 所有账本查询按当前会话账号隔离，so that 不同家庭的数据不会串。

## Implementation Decisions

### 1. 领域术语

统一定义见 `GLOSSARY.md`。本规格使用：

- **句子星**：单次录音映射出的 1–3 星，逐句反馈用。
- **账号星星**：账号级星星余额，只增不减。
- **完整练习**：同一 run 内每句都至少成功评分一次。
- **未完成练习**：没有覆盖全部句子的 run。
- **初始星星**：V0.4 上线时按内容历史最好星折算的一次性星星。
- **打卡**：北京时间某天至少完成一次完整练习。
- **本周挑战次数**：同一内容在周一至周日内的完整练习次数。
- **星星翻倍**：完整练习中三星句数达到 90%（四舍五入）时，本轮入账星星 ×2。
- **余额曲线**：按月展示的每日账号星星余额。
- **我的成长**：登录后的默认页面。

### 2. 星星账本

新增 `star_ledger` 表，随 `openDb` 初始化创建（`CREATE TABLE IF NOT EXISTS`），旧库自动补建：

```sql
CREATE TABLE IF NOT EXISTS star_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  kind TEXT NOT NULL CHECK (kind IN ('baseline', 'run')),
  unit_id TEXT NOT NULL,
  run_id TEXT,
  stars INTEGER NOT NULL,
  base_stars INTEGER NOT NULL,
  doubled INTEGER NOT NULL DEFAULT 0,
  occurred_on TEXT NOT NULL,   -- 北京时间 YYYY-MM-DD
  week_start TEXT,             -- 北京时间周一 YYYY-MM-DD；baseline 为 NULL
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_star_ledger_run
  ON star_ledger (account_id, run_id) WHERE run_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_star_ledger_baseline
  ON star_ledger (account_id, unit_id) WHERE kind = 'baseline';
CREATE INDEX IF NOT EXISTS idx_star_ledger_account_day
  ON star_ledger (account_id, occurred_on);
CREATE INDEX IF NOT EXISTS idx_star_ledger_account_week
  ON star_ledger (account_id, unit_id, week_start);
```

行语义：

- `kind = 'run'`：`run_id` 非空；`base_stars` 是本轮每句最高句子星之和；`doubled` 是 0/1；`stars` 是最终入账星（翻倍后）；`occurred_on` 是首次完成该 run 的北京时间日期；`week_start` 是同一日期所在周的周一。
- `kind = 'baseline'`：`run_id` 为 NULL；`stars = base_stars`；`doubled = 0`；`occurred_on` 是上线当月 1 日；`week_start` 为 NULL；`created_at` 是实际回填时间。
- 账本只增不减；v0.4 没有消费、扣减或过期。
- 同一个 `run_id` 只允许一行。run 首次完整后，如果同轮内继续补读使星数提高，更新该行的 `stars / base_stars / doubled`，不新增行、不改变首次 `occurred_on` 与 `week_start`。
- 总星数 = 该账号所有 `star_ledger` 行的 `stars` 之和。
- 打卡日 = 该账号 `kind='run'` 行的 `occurred_on` 去重；当天星数 = 当天所有 run 行的 `stars` 之和。
- 本周挑战次数 = 该账号 + 内容 + `week_start` 的 `kind='run'` 行数。
- 最近一次完整练习入账星 = 该账号 + 内容按 `occurred_on DESC, id DESC` 取第一条 run 行的 `stars`。

### 3. 完整练习与入账

在 `POST /api/units/[id]/practice` 中，评分成功后、写入 `practice_attempts` 的同一个数据库事务里执行：

1. 插入本次 attempt（现有逻辑）。
2. 查询该 `run_id` 覆盖的句子数：
   `COUNT(DISTINCT sentence_index) FROM practice_attempts WHERE owner = ? AND unit_id = ? AND run_id = ?`。
3. 与内容包的 `sentences.length` 比较：
   - 不相等：本轮仍未完整，不写账本，返回 `runComplete: false`。
   - 相等：本轮完整，继续。
4. 计算本轮每句最高句子星：同一 `run_id` 内按 `sentence_index` 取 `MAX(stars)`，再求和得到 `base_stars`。同一句在本轮读过多次，只取最高星。
5. 统计 `threeStarCount`：本轮每句最高星为 3 的句子数。
6. `doubled = threeStarCount >= Math.round(totalSentences * 0.9)`。
7. `stars = doubled ? base_stars * 2 : base_stars`。
8. 周上限防御检查：查询该账号 + 内容 + 本周已有的 run 行数（排除当前 `run_id`）。如果已经 ≥3，不写账本，返回 `runComplete: true, runStars: null, weeklyLimitReached: true`；正常情况下入口已经拦截，不应走到这里。客户端收到该状态时显示超次数弹窗，不显示入账星。
9. 写入或更新 `star_ledger`：
   - 首次完整：插入 run 行，`occurred_on` 取本次 attempt 的 `created_at` 折算北京时间，`week_start` 取该日期所在周一。
   - 已存在同 `run_id`：更新 `stars / base_stars / doubled`，保留首次 `occurred_on / week_start / created_at`。
10. 返回 `runComplete: true, runStars: stars, runDoubled: doubled, weeklyRuns: 写入后的本周次数`。

事务边界：attempt 插入与账本写入必须同一事务；评分服务调用在事务之前，失败时 attempt 不落库（沿用现有 502 语义）。

### 4. 每周挑战上限

- 周界：北京时间周一 00:00 到周日 24:00。`week_start` 存周一日期。
- 计数单位：账号 + 内容 + 周。只统计 `kind='run'` 行；未完成练习、初始星星、其他内容都不计入。
- 上限 3 次。
- 入口拦截：
  - `GET /api/units` 的每个单元、`GET /api/drafts?type=custom` 的每个已发布草稿、`GET /api/units/[id]` 的详情，都返回 `weeklyRuns`（当前周 0–3）。
  - 内容卡片点击时：如果 `weeklyRuns >= 3`，阻止跳转并弹站内弹窗；卡片外观保持可点击，不置灰。
  - 教材详情页：把 `weeklyRuns` 传给 `PracticeFlow`；`>= 3` 时点击「开始」弹同一个弹窗，不进入录音。
  - 弹窗文案：`这个内容本周已经挑战 3 次啦，下周再来挑战，先试试其他内容吧！`
  - 弹窗主按钮「去练其他内容」：标准内容跳 `/units`，自定义内容跳 `/custom`；次按钮「知道了」关闭。
- 服务端拦截：`POST /api/units/[id]/practice` 在调用评测服务之前检查本周次数；`>= 3` 返回 `409 WEEKLY_LIMIT_REACHED`，不调用讯飞、不写入 attempt。
- 平时不在列表或详情显示「本周已挑战 N/3」；次数只在用完后通过弹窗出现。

### 5. 初始星星与上线口径

新增一次性回填脚本 `scripts/backfill-baseline-stars.ts`：

- 对每个账号，按 `practice_attempts` 中的 `unit_id` 分组，计算每个内容的「每句历史最高句子星之和」。
- 每个内容插入一行 `kind='baseline'`：
  - `stars = base_stars = 该内容历史最好星之和`
  - `doubled = 0`
  - `occurred_on = 上线当月 1 日`（脚本运行当天的北京时间月份）
  - `week_start = NULL`
- `owner` 为 NULL 的旧记录：并入第一个 `is_admin = 1` 的账号；没有管理员时跳过并输出警告。并入时按 `effectiveOwner = owner ?? adminId` 重新计算每句最高星，再按内容汇总；不能把 NULL 的行简单相加，也不能让唯一索引把同一内容的已有 baseline 覆盖掉。
- 不写 run 行、不补打卡日、不修改 `practice_attempts`。
- 幂等：唯一索引 `(account_id, unit_id) WHERE kind='baseline'` 保证重复执行不重复插入；已有 baseline 行时跳过。
- 输出每个账号的 baseline 总数，方便核对。现有数据库预期：`01f…` 约 95，管理员约 75，NULL 约 35；NULL 并入管理员后按每句最高星重算，实际值以脚本输出为准。
- 部署：在 `scripts/deploy.sh` 的 `npm run build` 之后、`pm2 reload` 之前执行
  `npx tsx scripts/backfill-baseline-stars.ts`。`npm ci` 会安装 `tsx`（devDependency）。
- 回填不阻塞应用启动；如果忘记执行，成长页仍可用，只是已有账号没有初始星星。

上线月份与上线日期：

- 账号的 `launchDate` = 该账号最早一条 `star_ledger.created_at` 折算成北京时间日期；`launchMonth` = 该日期的年月。没有账本行的账号，`launchDate` 为今天、`launchMonth` 为当月。
- baseline 行的 `occurred_on` 是当月 1 日，所以上线当月的余额曲线从初始星星开始。
- 打卡与「练过但未完成」的浅色标记只从 `launchDate` 当天及以后记录；上线前的历史 attempt 不显示浅色点。

### 6. 打卡、连续天数与月历

- 打卡日：该账号在当天至少有一条 `kind='run'` 行。
- 当天星数：当天所有 run 行的 `stars` 之和（含翻倍）。
- 「练过但未完成」：当天有 `practice_attempts`，但没有 run 行，且日期 ≥ `launchDate`。
- 月历每天返回：
  ```ts
  { date: "YYYY-MM-DD", stars: number, checkedIn: boolean, partial: boolean }
  ```
  未打卡且未练习：`stars=0, checkedIn=false, partial=false`。
- 连续打卡：
  - 以北京时间为准。
  - 如果今天有打卡，从今天开始往前数；否则如果昨天有打卡，从昨天开始往前数；否则为 0。
  - 遇到第一个没有打卡的日期停止。
  - 未完成练习不延续连续打卡。
- 月视图范围：默认当月，可回看当前月及之前 11 个月（共 12 个日历月，约 1 年），不能看未来。
- 上线前月份（`month < launchMonth`）：
  - 不画曲线。
  - 日历显示空网格 + 说明：`打卡记录从 {launchMonth 的年} 年 {月} 月开始` / `之前的练习会折算成星星，但不补打卡记录。`
  - `monthStars = 0`；总星数和连续打卡仍显示当前值。

### 7. 余额曲线

- 每日余额 = 该账号 `occurred_on <= 当天` 的所有 `star_ledger.stars` 之和（包含初始星星和之前月份）。
- 当月视图只画到今天；未来日期不画点。过去月份画满整月。
- 曲线是折线图：横轴为 1..当月天数，纵轴从 0 到当月余额最大值的向上取整（如 100 的倍数）；打卡日画圆点；线下有浅色渐变填充。
- 卡片标题：`{月}月星星积累`；副标题：`每天结束时的账户星星余额`；右上角徽标：`+{monthStars} 🌟`；底部：`月初 {start}` 和 `现在 {end} 🌟`（当月）或 `月末 {end} 🌟`（过去月份）。
- 不引入图表库，使用内联 SVG（与原型一致）。
- 上线前月份不渲染曲线卡片。

### 8. 「我的成长」页面（A 方案）

- 路由 `/`，位于登录后的壳层内。
- 页面结构：
  1. 顶部：标题「我的成长」、副标题「每一次跟读，都会变成一颗小星星。」、右侧月份切换器。
  2. 三张统计卡：累计星星（超大数字 + 🌟）、连续打卡（N 天 + 🔥）、本月获得（N + 🌟）。
  3. 打卡日历卡：标题「打卡日历」、副标题「完成一条完整内容，就会点亮一天」、右上角当月星数徽标；7 列（周一至周日）月历。
  4. 余额曲线卡（当月或过去月份；上线前月份不显示）。
- 日历格子：
  - 打卡：浅琥珀底、右上角 ✓、底部 `🌟N`。
  - 练过未完成：浅灰底、底部琥珀色小圆点，不显示数字。
  - 没练：白底、日期灰色。
  - 今天：翡翠色描边 + 「今天」小字。
  - 图例：`✓ 完成打卡` / `圆点 练习过 · 未完成整条内容` / `🌟 当天获得星星`。
- 空状态：当月没有打卡且不是上线前月份时，日历下方显示一句轻提示「这个月还没有完整练完一条内容，今天试试吧！」（不改变日历结构）。
- 上线当月若 `launchDate` 不是 1 日，日历上方显示一行小注「打卡记录从 {launchDate} 开始」；浅色练习点也从该日起显示。
- 统计卡文案保持「本月获得」；它表示当前选中的月份，月份切换器提供上下文。
- 响应式：iPad 竖屏（768px）下日历全宽、曲线在下方；宽屏（xl）下日历与曲线并排。原型 A 是视觉基准。
- 数据加载：客户端页面，`GET /api/growth?month=YYYY-MM`；月份切换时重新请求；加载中显示占位，失败显示「加载失败，请刷新重试」。
- 总星数和连续打卡不随所选月份变化；「本月获得」、日历和曲线随月份变化。

### 9. 路由与导航

- `src/app/(shell)/page.tsx` 从「教材内容列表」改为「我的成长」。
- 教材内容列表移到 `src/app/(shell)/units/page.tsx`；详情仍是 `src/app/(shell)/units/[id]/page.tsx`。`GET /api/units` 不变。
- `/custom`、`/custom/upload`、`/drafts/...`、`/admin` 不变。
- 侧边栏：
  - 新增 `我的成长`（`/`，精确匹配）排第一。
  - `教材内容` 的 href 从 `/` 改为 `/units`，仍由 `standardContentVisible` 控制是否显示。
  - `自定义内容`、`管理` 顺序不变。
- 登录页仍跳 `/`，现在落到「我的成长」。
- 删除壳层 v0.3.6 的 `redirectHome`（家庭账号访问 `/` 重定向到 `/custom`）；`/` 对所有人都是成长页。
- 审计所有把 `/` 当作教材内容列表的链接（标准内容制作页、校对页、返回按钮等），改为 `/units`。管理员的成长页仍是 `/`。
- v0.3.6 的标准内容可见性闸门不变：开关关闭时非管理员看不到「教材内容」入口，`/api/units`、标准详情、练习、媒体仍按原有 403/404 处理；成长页不受影响。

### 10. 内容卡片与详情页

- 内容卡片（教材首页、标准制作列表、自定义列表）的「上次练习获得」改为「上次练完获得」：
  - 显示该账号在该内容上最近一次完整练习的入账星（含翻倍），取自账本。
  - 没有完整练习时显示「还没完整练过」。
  - 历史未完成轮次的句子星不再显示在卡片上。
- 实现：用 `latestAwardedRunStars(db, accountId, unitId)` 替换现有 `latestRunStars` 的调用点；现有 `latestRunStars` 的测试改写为账本口径，保持测试数量不减少。
- 标准列表 `GET /api/units`、自定义列表 `GET /api/drafts?type=custom`、详情 `GET /api/units/[id]` 都增加 `weeklyRuns`（当前周 0–3）。非 published 的自定义草稿 `weeklyRuns = 0`。
- 内容卡片点击拦截：`weeklyRuns >= 3` 时阻止跳转并打开弹窗；卡片不置灰。
- 详情页服务端把 `weeklyRuns` 传给 `PracticeFlow`；`>= 3` 时「开始」打开弹窗，不进入录音。详情页内容信息仍可查看。
- 练习页的句格与即时评分卡保持现状：
  - 句格显示每句历史最高句子星（`localBest`）。
  - 即时评分卡显示本次录音的句子星 + 最好成绩。
  - 不新增「本句最好 ★★★」之类的提示。

### 11. 练习结束页

`PracticeFlow` 在每次成功提交后保存服务端返回的 run 汇总：

```ts
interface RunSummary {
  runComplete: boolean;
  runStars: number | null;
  runDoubled: boolean;
  weeklyRuns: number;
  weeklyLimitReached: boolean;
}
```

结束页按 `sessionPracticed.size === unit.sentences.length` 判断是否完整：

- 完整 + 翻倍：
  - 庆祝卡片；主文案「读得太棒了🎉这次星星翻倍啦！」；大字显示 `{runStars}` + 🌟；副文案「共获得 {runStars} 🌟」。
  - 句子星格照常显示本轮每句最高星。
  - 「↺ 再练一遍」按钮。
- 完整未翻倍：
  - 保持现有收尾结构；显示「本次获得 {runStars} 颗星」（服务端值；缺失时回退客户端合计）。
  - 「↺ 再练一遍」。
- 未完整：
  - 标题不再写「整个内容练完啦」；显示「这次还差一点点」「本次读了 X/Y 句」。
  - 照常显示本轮句子星合计与句子星格。
  - 加标注：`未读完所有句子，不能累计星星🌟哦！`
  - 说明「点『再练一遍』，把剩下的句子读完就能拿到星星。」
  - 「↺ 再练一遍」。
- 「再练一遍」整体重开，生成新 `runId`，作为新的一轮；会重新检查本周挑战次数。
- 如果服务端返回 `weeklyLimitReached: true`（防御性拦截），结束页显示超次数弹窗，不显示入账星；本轮不入账。
- 不改变即时评分卡和句格的现有 UI。

### 12. 站内弹窗

新增共享组件 `src/components/shared/Modal.tsx`（客户端）：

- 背景：`bg-slate-900/40 backdrop-blur-sm`；卡片：白色、圆角 3xl、最大宽度 md、阴影。
- Props：`open`、`onClose`、`title`、`children`、`primaryLabel`、`onPrimary`、`secondaryLabel`、`onSecondary`。
- 交互：点击背景关闭、右上角 ✕ 关闭、Esc 关闭；焦点陷阱；打开时聚焦主按钮；`role="dialog"`、`aria-modal="true"`、`aria-labelledby`。
- 通过 portal 渲染到 `document.body`，避免被列表的 stacking context 裁剪。
- 本次只用于「本周挑战次数用完」弹窗；其他浏览器原生 `confirm` 不在本版本替换范围。

### 13. 接口

#### `GET /api/growth?month=YYYY-MM`

- 鉴权：`requireAccount`。
- `month` 缺省为当前月；格式不合法返回 `400 INVALID_MONTH`；超出「当前月及之前 11 个月（共 12 个日历月）」范围返回 `400 INVALID_MONTH`。
- 响应：
  ```ts
  {
    totalStars: number;        // 当前账号全部账本 stars 之和
    streakDays: number;        // 连续打卡天数
    launchMonth: string;       // "YYYY-MM"
    launchDate: string;        // "YYYY-MM-DD"
    month: string;             // 请求的月份
    isCurrentMonth: boolean;
    preLaunch: boolean;        // month < launchMonth
    monthStars: number;        // 所选月份 run 行 stars 之和
    days: Array<{
      date: string;            // YYYY-MM-DD
      stars: number;
      checkedIn: boolean;
      partial: boolean;
    }>;
    balances: Array<{ date: string; balance: number }>; // 上线前月份为空数组
  }
  ```
- `days` 覆盖所选月份每一天；`balances` 对上线后月份返回，当月只返回到今天，过去月份返回整月。
- 查询全部按当前账号；使用 `idx_star_ledger_account_day` 和 `idx_star_ledger_account_week`。

#### `GET /api/units`

- 现有响应基础上，每个 unit 增加 `weeklyRuns: number`。

#### `GET /api/units/[id]`

- 响应中的 unit 增加 `weeklyRuns: number`。

#### `GET /api/drafts?type=custom`

- 每个已发布草稿增加 `weeklyRuns: number`；非 published 为 0。

#### `POST /api/units/[id]/practice`

- 保持现有鉴权、可见性、未发布门禁、音频校验、转码、评分逻辑。
- 在调用评测服务前检查本周次数：`>= 3` 返回 `409 WEEKLY_LIMIT_REACHED`，消息为弹窗文案，不调用评测、不写 attempt。
- 评分成功并插入 attempt 后，执行第 3 节的完整练习入账，返回：
  ```ts
  {
    score: number;
    stars: number;
    isNewBest: boolean;
    bestScore: number;
    runComplete: boolean;
    runStars: number | null;
    runDoubled: boolean;
    weeklyRuns: number;
    weeklyLimitReached: boolean;
  }
  ```
- `runStars` 为最终入账星（含翻倍）；未完整时为 `null`。
- `weeklyRuns` 为写入后的本周完整练习次数（0–3）。

### 14. 日期与时间

新增 `src/lib/domain/beijing-date.ts`：

- 固定 UTC+8（中国无夏令时）。
- `beijingDateOf(input: Date | string): string` → `YYYY-MM-DD`。
  - 数据库 `created_at` 是 UTC 的 `YYYY-MM-DD HH:MM:SS`；解析时补 `Z`，再加 8 小时。
- `beijingMonthOf(date: string): string` → `YYYY-MM`。
- `beijingWeekStart(date: string): string` → 该日期所在周的周一 `YYYY-MM-DD`。
- `isValidMonth(month: string): boolean`。
- `daysInMonth(month: string): number`。
- `shiftMonth(month: string, delta: number): string`。
- `monthRange(currentMonth: string, monthsBack: number): string[]`。
- 所有日/周/月判断只走这些函数，不在路由或组件里手写时区换算。
- SQL 中需要按天分组时使用 `date(created_at, '+8 hours')`。

### 15. 数据迁移与部署

- `openDb` 增加 `star_ledger` 建表与索引；旧库自动补建，不引入迁移框架。
- `scripts/backfill-baseline-stars.ts` 按第 5 节执行；`scripts/deploy.sh` 在构建后、重启前调用。
- `docs/deploy.md` 增加：
  - 回填命令与预期输出；
  - 如何核对 baseline 总数；
  - 回填可重复执行；
  - 回滚时账本表可保留，不影响旧版本。
- 回填不修改 `practice_attempts`、内容包、草稿或媒体文件。
- 原型文件 `src/app/prototype/v04-growth/page.tsx` 仅用于设计评审，不作为实现基础；正式实现完成后删除或移到 throwaway 分支。

### 16. 错误语义

- 本周次数用完：`409 WEEKLY_LIMIT_REACHED`，消息与弹窗文案一致；不调用评测。
- 月份参数非法或超范围：`400 INVALID_MONTH`。
- 未登录/会话失效：沿用 `401 UNAUTHORIZED`。
- 内容不可见/不存在：沿用现有 403/404 语义。
- 账本写入失败：整个事务回滚，attempt 不落库；返回 500，客户端可重试（沿用现有错误处理风格）。

### 17. 兼容与回滚

- `practice_attempts` 结构不变；旧数据不迁移、不删除。
- 新增 `star_ledger` 是加法表；旧版本代码忽略它。
- 内容卡片口径从「最近一轮句子星」改为「最近一次完整练习入账星」；这是有意的行为变更，相关测试同步改写。
- 回滚到旧版本时，删除新路由/组件即可恢复旧行为；账本表可以保留，不影响旧版本。
- 不修改内容包 schema、内容可见性开关、鉴权、转码、评测服务。
- 现有测试保持全绿，数量只增不减；新增测试覆盖账本、上限、翻倍、baseline、growth API、路由变化。

## Testing Decisions

### 单元测试

- `beijing-date`：
  - UTC 日期跨北京午夜（如 `2026-11-04 16:30:00` → `2026-11-05`）。
  - 周一/周日边界；月首月末；闰年 2 月。
- `star-ledger`：
  - 完整 run 的覆盖判定：全部句子有 attempt 才算完整；缺一句不算。
  - 每句本轮最高星求和；同句多次提交只取最高。
  - 翻倍边界：15 句 14 句三星 → 翻倍；13 句 → 不翻倍；10 句 9 句 → 翻倍；1 句 1 句 → 翻倍。
  - 每周上限：第 1–3 次入账；第 4 次返回限次；未完成 run 不计数；不同内容独立计数。
  - 同 run 后续补读提高星数：更新同一行，不新增。
  - `latestAwardedRunStars`：取最近完整 run；无完整 run 返回 null。
- `growth` 聚合：
  - 总星数、当月星数、打卡日、浅色练习日、连续天数。
  - 上线前月份：无曲线、空日历、note 标记。
  - 当月曲线只到今天；过去月份整月。
  - 初始星星计入曲线起点，但不计入打卡/连续天数。
- 回填脚本：
  - 每个内容历史最好星求和。
  - NULL owner 并入管理员。
  - 幂等：第二次执行不新增。
  - 不写 run 行、不补打卡。

### 路由测试

- `POST /api/units/[id]/practice`：
  - 完整 run → 201/200，账本新增一行，返回 `runComplete/runStars`。
  - 未完整 → 无账本行，`runComplete=false`。
  - 翻倍 run → `runStars = base_stars * 2`。
  - 第 4 次 → 409，且评测服务未调用（用 fake scoring 断言）。
  - 不同账号隔离：A 的账本不影响 B。
- `GET /api/growth`：
  - 401 未登录。
  - 当前月、过去月、上线前月。
  - 非法 month → 400。
  - 总星/连续天数/月星/日历/余额字段。
- `GET /api/units`、`GET /api/units/[id]`、`GET /api/drafts?type=custom`：
  - `weeklyRuns` 正确（0–3）。
  - `latestRunStars`/卡片入账星改为账本口径。
- 回填脚本集成：临时 DB + 历史 attempts → baseline 行；重复执行幂等。

### 手工验收

- 登录后落到 `/`「我的成长」；侧边栏顺序正确；教材内容在 `/units`；管理员流程不受影响。
- 成长页 A 方案：三张统计卡、月历三种状态、图例、曲线、月份切换（含上线前月份 note）。
- 完成一条内容 → 账本入账、当天打卡、日历和曲线更新；卡片显示「上次练完获得」。
- 未读完 → 无入账、无打卡、结束页显示句子星 + 标注；「再练一遍」生成新 run。
- 翻倍：15 句 14 句三星 → 结束页显示 88 🌟；账本与曲线按 88 计。
- 同一内容本周第 4 次：卡片点击弹窗；详情页开始按钮弹窗；服务端 409；入口不置灰；平时不显示次数。
- 句格显示历史最高星；即时评分卡显示本次星 + 最好成绩；无额外提示。
- 教材内容可见性关闭时：成长页正常、教材入口隐藏、`/units` 仍按原有 403/404；管理员不受影响。
- iPad 768×1024 + 桌面宽度；弹窗焦点/Esc/背景点击；键盘可操作。
- 回填核对：输入口径 `01f…` 约 95、管理员约 75、NULL 约 35；NULL 并入管理员后按每句最高星重算，最终值以脚本输出为准；重复执行不重复插入。

### 回归基线

- `npm test` 全绿，测试数量只增不减。
- `npm run typecheck`、`npm run build` 全绿。
- 现有练习、上传、转写、校对、预览、定稿、媒体、登录、邀请制建号流程不受影响。

## Out of Scope

- 今日任务看板、任务生成、家长布置任务、任务完成判定。
- 宠物 UI、宠物动画、等级/称号（0.4.x；账本和总星数已能支撑阈值判断）。
- 多孩子/孩子档案切换。
- 星星消费、商城、排行榜、跨家庭比较。
- 补历史打卡日或把历史未完成轮次补成完整练习。
- 超过 1 年的月份回看。
- 一次性替换全站浏览器原生确认框（本次只做超次数弹窗）。
- 修改内容包 schema、评测服务、转写链路、内容可见性策略。
