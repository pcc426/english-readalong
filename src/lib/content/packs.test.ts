import { describe, it, expect } from "vitest";
import { listUnitPacks } from "./loader";

describe("仓库内容包", () => {
  it("content/units 下的真实内容包全部可加载且时间已定稿", () => {
    const units = listUnitPacks("content/units");
    expect(units.map((u) => u.id)).toEqual([
      "u2-dragon-dance",
      "u3-amazing-plants",
    ]);
    for (const unit of units) {
      expect(unit.sentences.length).toBeGreaterThan(0);
      for (const sentence of unit.sentences) {
        expect(sentence.start, `${unit.id} 有句子未定时间`).not.toBeNull();
        expect(sentence.end, `${unit.id} 有句子未定时间`).not.toBeNull();
      }
    }
  });
});
