# 03: 教材归属落内容包 + 老标准包迁移脚本

**What to build:** 定稿写包时教材归属（版本/书/单元/模块/课文名）目前会丢失（finalize.ts buildContentPack 只写 title/source/type/owner）。需要把这些字段落进 ContentPack 并回填 3 个已存在的标准包。

1. ContentPack schema（`src/lib/content/schema.ts`）对标准包新增可选字段：`seriesCode?`、`bookId?`、`unitNo?`、`moduleKind?`、`lessonTitle?`（custom 包这些字段不写）；另加 `poster?`（票 01 的字段，两类型都可）。`unitId` 可由 bookId+unitNo 推导，不必冗余存。
2. finalize.buildContentPack：standard 草稿写包时从草稿的 unit_id/module_kind 反查注册表（票 02），把上述字段 + 课文名 + poster（草稿的封面相对路径）写入；source 仍为 "standard-upload"。custom 包仅加 poster。
   - 卡片/练习页展示：title 仍读 pack.title（标准＝课文名），枚举串由新纯函数 `standardEnumSubtitle(pack)` 用字段拼（与票 02 生成器共用实现）
   - 自定义包没有这些字段时，副标题继续用现有 sourceLabel 文案
3. 排序/筛选数据基础：owned-content/loader 对标准包提供 unitNo/moduleKind/seriesCode/bookId 字段；**默认排序**＝seriesCode → grade → term → unitNo → 模块在教材 JSON 中的索引（不是字母序！ Talking time 在 Story time 前）。
4. 一次性迁移脚本 `scripts/migrate-v03-standard-packs.*`：
   - 随代码 2 包：u2-dragon-dance.json → 五上-U2 Story time（7 句，source 串可佐证）；u3-amazing-plants.json → 五上-U3 Chant time（5 句）
   - 运行时标准包 `data/content/standard/f5fcec05-….json`（11 句 Plants and the Weather）→ 从对应 content_drafts 行的 unit_id/module_kind 回填（实为五上-U3 Reading time，以查库结果为准）
   - 三个包同时补 poster 引用（封面文件由票 01 脚本生成）
   - 幂等：有字段且正确则跳过；输出每条的 before/after 行
5. 随代码的 2 个包改完后要仍通过 zod 校验、仍被 loader 当 shipped 标准包加载（同 id 代码版优先规则不变）。

**Blocked by:** 01, 02

**Status:** ready-for-agent

## 实现要点

- 模块顺序以 grade5a.json modules 数组顺序为准（枚举数组 MODULE_KINDS 的字母/声明顺序都不对：U1 是 Talking→Story，U3 是 Chant→Talking→Reading）
- 枚举串中的句数＝pack.sentences.length（运行时算），不持久化句数字段
- 自定义标题（如家长自己填的 "沪教版_U5_Rhyme_Time"）不动、不推导枚举串
- 脚本操作前备份？个人项目可直接改，git 已管随代码包；data 下的包建议脚本先打印计划等确认（dry-run 默认开）

## 验收

- [ ] 新定稿标准包 JSON 内含全部归属字段 + lessonTitle + poster，custom 包只有 poster（如有）
- [ ] 3 个老包 dry-run 输出正确归属，实际执行后 zod 校验通过、列表/练习页正常加载
- [ ] 教材列表默认顺序按单元与模块教材序（U1 Talking, U1 Story, U2 Talking…），不是文件名字典序
- [ ] 退回校对再重新定稿后字段仍正确（unpublish 不删草稿归属）
- [ ] npm test / typecheck / build 全绿；迁移脚本有单测或用 testdata 目录验证

## Comments

- 2026-10-30 实施：commit 13d82ff（合入 813d5e9）；浏览器实测（v03，1024×768）：迁移脚本 dry-run 后 --apply：u2-dragon-dance→五上-U2/Story time，u3-amazing-plants→五上-U3/Chant time，运行时包 f5fcec05→五上-U3/Reading time，三包同时补 poster；重跑全部 skipped（幂等）。首页三张卡副标题为 Unit2-Story time-7句 / Unit3-Chant time-5句 / Unit3-Reading time-11句。
- 2026-10-30 code-review 修复：commit 234c27c（迁移/补抽实跑、预览副标题接线、预览门槛三处统一、saving 即时、文案与术语、注册表查找与媒体 URL 收敛、GLOSSARY 补 run 词条）。
