export interface WhisperWord {
  text: string;
  start: number;
  end: number;
}

export type AlignStatus = "matched" | "uncertain" | "missing";

export interface SentenceTiming {
  index: number;
  /** 教材原文（权威文本） */
  text: string;
  start: number | null;
  end: number | null;
  status: AlignStatus;
  /** 音频在该时间窗内实际读的内容（转写），供人工比对冲突 */
  heard?: string;
  /** 对齐相似度 0-1 */
  similarity?: number;
}

/** 小写、去标点（保留字母数字与撇号）、压缩空白，供比对。 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/[^a-z0-9'\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function dice(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const t of a) counts.set(t, (counts.get(t) ?? 0) + 1);
  let inter = 0;
  for (const t of b) {
    const c = counts.get(t) ?? 0;
    if (c > 0) {
      inter++;
      counts.set(t, c - 1);
    }
  }
  return (2 * inter) / (a.length + b.length);
}

const MATCH_MIN = 0.8;
const UNCERTAIN_MIN = 0.5;

/**
 * 把已知教材句子按顺序对齐到 whisper 词流上。
 * 每句在剩余词流里找相似度最高的滑窗：≥0.8 matched，0.5-0.8 uncertain，
 * 找不到 missing（指针不动，不影响后续句对齐）。边界取窗口首尾词的时间。
 */
export function alignSentences(
  sentences: string[],
  words: WhisperWord[]
): SentenceTiming[] {
  const norm = words.map((word) => ({
    ...word,
    tokens: tokenize(word.text),
  }));

  let pointer = 0;
  return sentences.map((sentence, index) => {
    const target = tokenize(sentence);
    let best = {
      score: 0,
      start: -1,
      end: -1,
      heard: "",
    };
    for (let i = pointer; i < words.length; i++) {
      const lo = Math.max(1, target.length - 2);
      const hi = target.length + 2;
      for (let len = lo; len <= hi && i + len <= words.length; len++) {
        const window = norm.slice(i, i + len);
        const score = dice(
          window.flatMap((x) => x.tokens),
          target
        );
        if (score > best.score) {
          best = {
            score,
            start: i,
            end: i + len - 1,
            heard: window.map((x) => x.text).join(" "),
          };
        }
      }
    }

    const common = {
      index,
      text: sentence,
      start: best.start >= 0 ? norm[best.start].start : null,
      end: best.end >= 0 ? norm[best.end].end : null,
      heard: best.heard || undefined,
      similarity: best.score > 0 ? Number(best.score.toFixed(2)) : undefined,
    };
    if (best.score >= MATCH_MIN) {
      pointer = best.end;
      return { ...common, status: "matched" as const };
    }
    if (best.score >= UNCERTAIN_MIN) {
      return { ...common, status: "uncertain" as const };
    }
    return { index, text: sentence, start: null, end: null, status: "missing" as const };
  });
}
