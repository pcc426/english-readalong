import { describe, it, expect } from "vitest";
import { alignSentences, type WhisperWord } from "./align";

function w(text: string, start: number, end: number): WhisperWord {
  return { text, start, end };
}

describe("已知文本对齐", () => {
  it("按顺序把教材句子对齐到词流，边界取首尾匹配词", () => {
    const sentences = ["hello world", "the dragon dances", "goodbye now"];
    const words = [
      w("Hello", 0.0, 0.5),
      w("world", 0.5, 1.0),
      w("um", 1.0, 1.2), // 转写噪声词，不应破坏对齐
      w("the", 1.5, 1.7),
      w("dragon", 1.7, 2.1),
      w("dances", 2.1, 2.6),
      w("goodbye", 3.0, 3.5),
      w("now", 3.5, 3.8),
    ];
    const result = alignSentences(sentences, words);
    expect(result.map((r) => r.status)).toEqual([
      "matched",
      "matched",
      "matched",
    ]);
    expect(result[0].start).toBe(0.0);
    expect(result[0].end).toBe(1.0);
    expect(result[1].start).toBe(1.5);
    expect(result[1].end).toBe(2.6);
    expect(result[2].start).toBe(3.0);
    expect(result[2].end).toBe(3.8);
  });

  it("音频与教材原文有出入时标记 uncertain 并记录实际所读", () => {
    const sentences = ["the leaves take in the sunlight"];
    const words = [
      w("The", 0.0, 0.2),
      w("leaves", 0.2, 0.5),
      w("turn", 0.5, 0.8), // 教材是 take in，音频读成 turn —— 素材偏差场景
      w("the", 0.8, 0.9),
      w("sunlight", 0.9, 1.4),
    ];
    const result = alignSentences(sentences, words);
    expect(result[0].status).toBe("uncertain");
    expect(result[0].heard).toContain("turn");
    expect(result[0].start).toBe(0.0);
    expect(result[0].end).toBe(1.4);
  });

  it("音频里根本没有的句子标记 missing，时间为空", () => {
    const sentences = ["everyone follow minmin"];
    const words = [w("Hello", 0.0, 0.5), w("world", 0.5, 1.0)];
    const result = alignSentences(sentences, words);
    expect(result[0].status).toBe("missing");
    expect(result[0].start).toBeNull();
    expect(result[0].end).toBeNull();
  });

  it("标点与大小写不影响对齐", () => {
    const sentences = ['"Head of the dragon, slow down!"'];
    const words = [
      w("Head", 0.0, 0.3),
      w("of", 0.3, 0.4),
      w("the", 0.4, 0.5),
      w("dragon,", 0.5, 0.8),
      w("slow", 0.8, 1.1),
      w("down!", 1.1, 1.4),
    ];
    const result = alignSentences(sentences, words);
    expect(result[0].status).toBe("matched");
    expect(result[0].start).toBe(0.0);
    expect(result[0].end).toBe(1.4);
  });
});
