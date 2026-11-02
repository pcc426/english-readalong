import { describe, expect, it } from "vitest";
import {
  DEFAULT_PAUSE_MS,
  endsSentence,
  splitWordsIntoSentences,
  type LfasrWord,
} from "./resplit";

const frame = { frameStartMs: 0, frameEndMs: 6000 };

function w(
  text: string,
  startMs: number | null,
  endMs: number | null,
  wp?: string
): LfasrWord {
  return { text, startMs, endMs, wp };
}

describe("切句：句末标点", () => {
  it("一帧里三句话被切成三句（讯飞常把连续朗读合为一段）", () => {
    const words = [
      w(" Look at the dragon.", 0, 1200, "n"),
      w(" It's so long.", 1200, 2200, "n"),
      w(" It's very colourful.", 2200, 3600, "n"),
    ];
    expect(splitWordsIntoSentences(words, frame)).toEqual([
      { text: "Look at the dragon.", startMs: 0, endMs: 1200 },
      { text: "It's so long.", startMs: 1200, endMs: 2200 },
      { text: "It's very colourful.", startMs: 2200, endMs: 3600 },
    ]);
  });

  it("逗号不切句", () => {
    const words = [
      w(" Head of the dragon,", 0, 1000, "n"),
      w(" slow down!", 1000, 2000, "n"),
    ];
    expect(splitWordsIntoSentences(words, frame)).toHaveLength(1);
  });

  it("问号与感叹号都切；全角标点也认", () => {
    const words = [
      w(" What is your name?", 0, 900, "n"),
      w(" My name is Danny！", 900, 1800, "n"),
      w(" Let's play together。", 1800, 2600, "n"),
    ];
    expect(splitWordsIntoSentences(words, frame).map((s) => s.text)).toEqual([
      "What is your name?",
      "My name is Danny！",
      "Let's play together。",
    ]);
  });

  it("单句帧行为与旧解析一致", () => {
    const words = [w(" What", 0, 300), w(" is", 300, 500), w(" your", 500, 800), w(" name?", 800, 1200)];
    expect(splitWordsIntoSentences(words, frame)).toEqual([
      { text: "What is your name?", startMs: 0, endMs: 1200 },
    ]);
  });
});

describe("切句：停顿兜底", () => {
  it("无标点时相邻词静默 ≥700ms 切开", () => {
    const words = [
      w(" Hello", 0, 400),
      w(" everyone", 400, 1000),
      w(" let's", 1800, 2100),
      w(" start", 2100, 2500),
    ];
    expect(splitWordsIntoSentences(words, frame).map((s) => s.text)).toEqual([
      "Hello everyone",
      "let's start",
    ]);
  });

  it("430ms 停顿不切（实测该阈值会误切）", () => {
    const words = [w(" Hello", 0, 400), w(" everyone", 830, 1200)];
    expect(splitWordsIntoSentences(words, frame)).toHaveLength(1);
  });

  it("阈值可配置", () => {
    const words = [w(" Hello", 0, 400), w(" everyone", 900, 1200)];
    expect(splitWordsIntoSentences(words, { ...frame, pauseMs: 400 })).toHaveLength(2);
    expect(splitWordsIntoSentences(words, { ...frame, pauseMs: DEFAULT_PAUSE_MS })).toHaveLength(1);
  });
});

describe("切句：时间兜底", () => {
  it("没有词级时间时按词数比例摊分帧区间", () => {
    const words = [
      w(" One.", null, null, "n"),
      w(" Two.", null, null, "n"),
      w(" Three.", null, null, "n"),
      w(" Four.", null, null, "n"),
    ];
    const out = splitWordsIntoSentences(words, { frameStartMs: 1000, frameEndMs: 5000 });
    expect(out.map((s) => [s.startMs, s.endMs])).toEqual([
      [1000, 2000],
      [2000, 3000],
      [3000, 4000],
      [4000, 5000],
    ]);
  });
});

describe("endsSentence", () => {
  it("识别句末标点", () => {
    expect(endsSentence(w(" name?", null, null, "p"))).toBe(true);
    expect(endsSentence(w(" down!", null, null))).toBe(true);
    expect(endsSentence(w(" dragon,", null, null, "p"))).toBe(false);
    expect(endsSentence(w(" dragon", null, null, "n"))).toBe(false);
  });
});
