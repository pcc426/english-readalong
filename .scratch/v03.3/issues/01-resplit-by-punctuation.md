# 01: 帧内按词级标点/停顿重切句

**What to build:** 保住 LFASR 返回的词级信息（词时间 + 词性），把「一帧＝一句」改成「一帧内按句末标点重切」。

1. `src/lib/drafts/transcription/xunfei/resplit.ts`（新）：`LfasrWord`、`endsSentence()`、`splitWordsIntoSentences(words, {pauseMs, frameStartMs, frameEndMs})`。
   - 句末标点 `.?!` + 全角 `。？！` 断句；逗号/冒号/分号不断
   - 无标点时按词间停顿 ≥ pauseMs（默认 700）断句
   - 时间取首末词毫秒；无词时间时按词数比例摊分帧区间
2. `parse.ts`：帧分支改为收集词流（`ws[].wb/we` → 相对 `st.bg` 的毫秒；`cw[].wp`）后调用重切；`parseLfasrSentences(decoded, {pauseMs?})`。旧形态（`{bg,ed,onebest}`、无词时间）保持原行为。
3. `transcription/env.ts`：`lfasrPauseMs()` 读 `LFASR_PAUSE_MS`；`service.ts` 传入。
4. `docs/deploy.md` 增补该可选环境变量。

**Blocked by:** None

**Status:** ready-for-agent

## 实现要点

- 以**字面标点**为准断句，不依赖 `wp`（实测 wp 与文本偶有不一致）；`wp='g'` 也视作分段
- 不改 LLM 模式（`LFASR_MODE=llm` 走另一套返回形态）
- 时间戳异常（长音乐段）不在本票处理范围，校对页仍可人工微调

## 验收

- [x] 单测：一帧三句、逗号不断、全角标点、430ms 不切、阈值可配、无词时间按比例摊分
- [x] 真实响应（U2，30s）：2 句 → 10 句
- [x] npm test 594 / typecheck / build 全绿

## Comments

- 2026-11-02 实施：新增 resplit.ts + 12 条测试；parse.ts 帧分支改为词流重切；env 增加 LFASR_PAUSE_MS（默认 700ms），deploy 文档同步。真实 LFASR 返回（/tmp/lfasr-probe-baseline.json）改写对照：旧 2 句 → 新 10 句，与 ISE 真值 8 句大体吻合；残留问题为 ASR 文本错误（"with you" 被识别成 with + You、开头 yeah 噪声）与音乐段恢复点差异，属校对职责。594 测试通过。
