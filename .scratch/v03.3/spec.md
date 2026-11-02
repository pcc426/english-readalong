# V0.3.3：利用 LFASR 词级信息重切句（方案 1）

状态：调研结论落地（2026-11-02）
前置调研：`/tmp/asr-split-research.md`（未入库）；本版只做方案 1，方案 2（教材原文强制对齐）不采用——用户的视频是网友教辅，句子与教材本来就有出入。

## 问题

讯飞 LFASR 标准版返回的「帧」实际是 VAD 段，一段里可能含好几个自然句；而解析器 `parse.ts` 只做 `cw[].w` 拼接，把词级时间（`ws.wb/we`，10ms 帧）与词性/标点（`cw[].wp`）全丢了，因此出现「口语 3 句被转成 1 条长句」，校对时要手工拆。

## 决策

1. 解析时保留词流：`{ text, startMs, endMs, wp }`（wb/we 相对帧起点，1 帧 = 10ms）。
2. 新增纯函数 `splitWordsIntoSentences()`（`xunfei/resplit.ts`）在帧内重切：
   - 遇到 `. ? !`（含全角）即断句，逗号/冒号不断；
   - 无标点时用词间停顿兜底，默认 **700ms**（实测 430ms 会把正常连读误切），可用 `LFASR_PAUSE_MS` 调整；
   - 句子时间取首词 `startMs` 与末词 `endMs`；词没有时间时按词数比例在帧区间内摊分（校对页仍可 ±0.25s / 设为播放位微调）。
3. `parseLfasrSentences(decoded, { pauseMs })`；`service.ts` 从 env 读取阈值。旧形态（Java SDK 归一化、无词时间）行为不变。
4. 文档：`docs/deploy.md` 增补 `LFASR_PAUSE_MS`。

## 真实数据验证（U2 Story time，30 秒）

用调研抓到的真实 LFASR 返回：

- 改造前：**2 句**（两帧各一句，其中一句含 3 个自然句）
- 改造后：**10 句**，与 ISE 强制对齐得到的 8 句真值大体吻合

已知残留（属 ASR 文本错误，非切句问题，仍需人工校对）：
- 开头 `yeah` 被单独识别成一句（噪声词）
- `We can't keep up with.` / `You stop to` 被切错——ASR 把 "with you" 识别成了 "with"+"You"，并自行加了句号
- 16.8–24.7s 之间是音乐/静音段，两套引擎对「语音恢复点」判断不同（LFASR 记 24.77s，ISE 记 16.77s）

## 不做

- 方案 2（教材原文强制对齐）、ISE 强制对齐：用户的视频非官方教材配套，句子与原文有出入，硬对齐会频繁 `is_rejected`
- 更换 ASR 供应商 / 引入 Python 栈（违背 ADR-0004）

## 验收

- `npm test` 583 → 594，typecheck / build 全绿
- 真实返回改写对照见上；单测覆盖：一帧多句、逗号不断、全角标点、430ms 不切、阈值可配置、无词级时间按比例摊分
