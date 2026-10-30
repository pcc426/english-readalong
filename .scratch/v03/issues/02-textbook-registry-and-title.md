# 02: 教材注册表、模块/年级枚举与标准标题生成器

**What to build:** 现状只有一个硬编码五上的 grade5a.json，版本/年级学期没有字段或枚举；标准表单标题是自由文本（勘察见 spec 决策 12–17）。

1. 教材注册表（`src/lib/textbook/`）：
   - 顶层描述 `{ series: { code, shortName, display }, books: [{ id, grade, term, json }] }`
   - 版本仅一项：`series = { code:"sh-jiaoban-new", shortName:"沪教版", display:"沪教版（上教新版）" }`
   - book 仅注册 `{ id:"grade5a", grade:5, term:"a"（第一学期/上）, json: grade5a.json }`；textbook.ts 从注册表取书，不再裸 import 单文件
   - 模块枚举维持现有六值（schema.ts MODULE_KINDS，**印刷名不改**）；新栏目是枚举外值时构建期校验报错，提示补枚举
   - unitId 正则从写死 `^五上-U…` 改为按注册表动态构建（book 简称如「五上」作为 book 的字段，如 `shortName:"五上"`）
2. 标题/副标题生成器（`src/lib/textbook/title.ts` 纯函数 + 单测）：
   - 主标题＝课文名（textbook JSON 的 module.title，如 "The dragon dance"）
   - 枚举串＝`${series.shortName}${book.shortName}-Unit${index}-${moduleKind}-${n}句`，例：`沪教版五上-Unit2-Story time-7句`
   - n 来自草稿实际 confirmed 句数（校对/定稿阶段都可算）；分隔符是半角 `-`
3. 标准制作表单（StandardAdminClient）：
   - 删除自由标题 input；改为「版本（固定显示沪教版（上教新版），不可选）→ 学期（下拉，只列注册表中的书：当前只有「五年级上册」一项）→ 单元（联动）→ 模块（联动，只列该单元实际模块）」
   - 选完模块后实时展示拼好的**主标题（课文名）+ 枚举串预览**（不可手改）；提交不再带 title 字段，服务端按 unitId/moduleKind 生成草稿标题（课文名）与枚举串所需字段
4. uploads 路由：标准草稿服务端二次校验从「课本存在该模块」扩展为「版本/书/单元/模块均在注册表」；draft 行需要能取回这些字段（见票 03 的落包字段，本票先保证 draft 层 title＝课文名）。

**Blocked by:** None

**Status:** ready-for-agent

## 实现要点

- grade5a.json 数据本身不动（单元/模块/句子已核对），只改装载方式；`/api/textbook/module` 行为不变
- 卡片/练习页主标题用课文名是**展示层**变化，ContentPack 需要新增 lesson/枚举字段（票 03）；本票只覆盖草稿制作链路与生成器
- 六模块经五上全部 10 单元核对均含朗读文本，单词/练习栏目本来就没进 JSON
- 「牛津上海版」字样不应再出现在 UI（GLOSSARY 已注明是旧版）

## 验收

- [ ] 制作标准内容：版本固定、学期只有五上、单元模块联动与现状一致；标题预览随选择实时变化
- [ ] 生成器单测覆盖：`沪教版五上-Unit2-Story time-7句`、Unit10、各模块印刷名（含 "Chant time" 不被改成 ChantingTime）
- [ ] 提交一个标准草稿后，草稿标题是课文名（如 The dragon dance），不再能手填
- [ ] 注册表只有五上时 UI 不出现其他学期；以后加书只需注册 + 加 JSON
- [ ] 枚举外模块名构建期报错信息明确指向 MODULE_KINDS
- [ ] npm test / typecheck / build 全绿
