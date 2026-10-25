# 教材原文提取复核清单（五年级上册）

> 本文件与 `grade5a.json` 配套。JSON 是**机器提取的初版**，票 11 的"人工校对后定稿"
> 验收项由人工完成：逐模块对照 PDF 核对句子后，直接修订 JSON（`needsReview`/`notes`
> 字段可同步清理）。`textbook.pageOffset = 5`，即书页码 N 对应 PDF 第 N+5 页；
> 各模块的 `sourcePages` 已写明书页码范围。

## 提取范围与统计

- 教材：沪教版（五·四学制）英语 五年级上册（100 页 PDF，有文字层）
- 收录栏目（24 个模块）：Talking time（10）/ Story time（5）/ Reading time（5）/
  Chant time（1）/ Rhyme time（2）/ Song time（1）
- 共 375 句，其中 5 句被脚本标记 `needsReview`（见下）
- 提取脚本：`scripts/extract-textbook.py`（一次性工具，环境重建命令见脚本头注释）

## 一、必须人工核对的句子（needsReview）

这几句是教材里"引语 + 叙述语"混排的句子。提取时按仓库内容包惯例剥除了引号，
引语边界处拼接后读起来不顺。人工校对时建议二选一：恢复引号，或按语义拆句。

| 位置 | 句子 | 教材原文（书页） |
| --- | --- | --- |
| 五上-U1 Story time #0 | At the Pottery Club, Miss Li says, All the brush pots are dry now. | "At the Pottery Club, Miss Li says, "All the brush pots are dry now. …"" (p14) |
| 五上-U5 Rhyme time #1 | He is very nice and says kindly, I know it hurts. | "He is very nice and says kindly, "I know it hurts. It's OK to cry."" (p43) |
| 五上-U5 Rhyme time #8 | A nurse takes my temperature, and Dr Li is very nice and says gently, You have a fever. | ""You have a fever. And it's the flu. …"" 前有 "says gently," (p43) |
| 五上-U6 Story time #4 | Do you like this story? she asked, Nod your head for yes. | ""Do you like this story?" she asked, "Nod your head for yes."" (p54) |
| 五上-U10 Story time #14 | Now Baggie is happy, Wow, I'm flying and I'm useful again! | "Now Baggie is happy, "Wow, I'm flying and I'm useful again!"" (p87) |

## 二、机器做的取舍（校对时请确认口径）

1. **栏目口径**：只提取 Talking time / Story time / Reading time / Chant time /
   Rhyme time / Song time 六类正文栏目。Fun time（海报、通知、歌单、测验）、
   Project、Find the rule 等练习/任务栏目未收录——与票面"Talking time / Story time /
   Chant time 等目标模块"的口径一致。如需收录 Fun time 的短文（如 U2 的 garden
   party 通知），需另行提取。
2. **引号剥除**：全部弯引号 `“”` 被剥除，省字号 `’` 归一为 `'`，与 V0.1 已验收
   内容包（content/units/*.json）的文本惯例一致。副作用见上表。
3. **歌谣行拼接与小写化**：Chant/Rhyme/Song 的印刷行以逗号结尾时与下一行拼成自然句，
   拼接行首的 And/But/So/Why/To 等虚词转为小写（教材行首大写是排版风格）。
   如 U3 Chant："…in place, And take in…" → "…in place, and take in…"。
4. **对话场景顺序**：Talking time 的对话按插图编号 ①②… 分场景，文本列与插图左右
   交错，无全局排版规律。脚本按逐页人工核对的窗口配置取句（`TALKING_WINDOWS`），
   每个对话的语序已按插图编号排好；建议校对时通读各对话确认连贯。
5. **对话引入句**：U3/U6/U9 的对话页有一句场景说明（如 "Xiaopu, Xiaotian and
   Xiaojiang are visiting the botanical gardens."），按印刷正文收录为该模块第一句。
   不想要可删。
6. **U4 日记的日期/天气行**："Monday, 28 March"、"Sunny" 等日记抬头不是课文句子，
   已过滤；三则日记正文（Sangsang / Momo / Kangkang）完整收录。
7. **U9 书信的称呼/落款**："Dear Simon,"、"From Star 88"、"Hi Star 88!"、
   "Simon" 等书信框架行已过滤，两封信与两封回信的正文句子完整。
8. **模块标题**：取自教材目录页。正文页的标题多为图形化字体（部分没有文字层；
   U1 对话标题的文字层还把 "It's" 抽成了 "lt's"），故未从正文页取。
9. **噪声过滤**：练习指令、语法框（Find the rule）、语音栏（Sound）、填空、
   图注、页码、"I can…" 自评行等按字体与版式规则过滤；每页正文只取第一条
   练习指令以上的部分（教材版式恒为"正文在上、练习在下"）。

## 三、与 V0.1 内容包的交叉验证

- **U3 Chant time（Parts of plants）**：5 句与已验收的
  `content/units/u3-amazing-plants.json` 逐字一致（含小写化处理），可作基准。
- **U2 Story time（The dragon dance）**：V0.1 包的 7 句全部包含在本次提取中；
  本次按教材原文多出叙述句与说话人归属句（如 "Xiaopu calls out at the tail of
  the dragon."、"Mr Zhong says."）。V0.1 包跟视频字幕走，教材原文才是权威来源
  （见 GLOSSARY「教材原文」词条），两者以教材为准。

## 四、复核操作建议

1. 逐模块打开 `grade5a.json`，对照 PDF（书页码 + `pageOffset`）通读句子；
2. 优先处理上表 5 个 `needsReview` 句；
3. 抽查 2-3 个对话的场景语序（尤其五上-U3 四场景对话）；
4. 确认二节的口径后，把确认结果记在本文件末尾（校对人 + 日期）。

_机器初版：extract-textbook.py，2026-10-25。人工校对：待定。_
