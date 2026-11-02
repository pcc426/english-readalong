// LFASR 词流重切句（V0.3.3，方案 1）：
// 讯飞把一段连续朗读切成一个「帧」（实际是 VAD 段），帧里可能包含好几个自然句。
// 帧内每个词带 wp（n 普通 / s 顺滑 / p 标点 / g 分段），词还带起止帧。
// 这里按「句末标点」重切，标点缺失时用词间停顿兜底——不再依赖引擎的分段粒度。

export interface LfasrWord {
  /** 词文本（讯飞英文分词自带前导空格） */
  text: string;
  /** 词起止毫秒；缺词级时间时为 null */
  startMs: number | null;
  endMs: number | null;
  /** 讯飞词性标记：n 普通 / s 顺滑 / p 标点 / g 分段 */
  wp?: string;
}

export interface SplitSentence {
  text: string;
  startMs: number;
  endMs: number;
}

export interface SplitOptions {
  /** 无标点时的停顿兜底阈值（毫秒）；实测 430ms 会误切，默认 700 */
  pauseMs?: number;
  /** 所在帧的起止毫秒，用于无词级时间时按词数比例摊分 */
  frameStartMs: number;
  frameEndMs: number;
}

export const DEFAULT_PAUSE_MS = 700;

/** 句末标点（半角 + 全角）；逗号、冒号、分号不算句末 */
const SENTENCE_END = /[.?!。？！]["'”’)]*$/;

/** 该词是否收尾一句：以句末标点结尾（或讯飞标了分段 wp=g） */
export function endsSentence(word: LfasrWord): boolean {
  const text = word.text.trim();
  if (!text) return false;
  // 以字面标点为准，不依赖 wp（实测 wp 与文本标点偶有不一致）
  return SENTENCE_END.test(text) || word.wp === "g";
}

/**
 * 把一帧内的词切成句子。
 * 规则：遇到句末标点即切；否则相邻词停顿 ≥ pauseMs 也切；
 * 时间取自首/末词的毫秒，词无时间时按词数比例在帧区间内摊分。
 */
export function splitWordsIntoSentences(
  words: LfasrWord[],
  options: SplitOptions
): SplitSentence[] {
  const pauseMs = options.pauseMs ?? DEFAULT_PAUSE_MS;
  const groups: LfasrWord[][] = [];
  let current: LfasrWord[] = [];

  const flush = () => {
    if (current.length > 0) groups.push(current);
    current = [];
  };

  words.forEach((word, i) => {
    current.push(word);
    const next = words[i + 1];
    if (!next) return;
    if (endsSentence(word)) {
      flush();
      return;
    }
    const gap =
      word.endMs !== null && next.startMs !== null
        ? next.startMs - word.endMs
        : null;
    if (gap !== null && gap >= pauseMs) flush();
  });
  flush();

  return groups
    .map((group, index) => {
      const text = group
        .map((w) => w.text)
        .join("")
        .trim();
      if (!text) return null;
      const timed = group.every((w) => w.startMs !== null && w.endMs !== null);
      if (timed) {
        return {
          text,
          startMs: group[0].startMs as number,
          endMs: group[group.length - 1].endMs as number,
        };
      }
      // 无词级时间：按词数比例摊分帧区间（校对页仍可 ±0.25s / 设为播放位微调）
      const total = groups.reduce((n, g) => n + g.length, 0) || 1;
      const before = groups
        .slice(0, index)
        .reduce((n, g) => n + g.length, 0);
      const span = Math.max(0, options.frameEndMs - options.frameStartMs);
      return {
        text,
        startMs: Math.round(options.frameStartMs + (span * before) / total),
        endMs: Math.round(
          options.frameStartMs + (span * (before + group.length)) / total
        ),
      };
    })
    .filter((s): s is SplitSentence => s !== null);
}
