import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { listContent } from "./loader";

describe("仓库内容包", () => {
  it("content/units 下的真实内容包全部可加载且时间已定稿", () => {
    // 显式清掉环境覆盖：本测试固定测仓库自带的标准内容目录。
    // 运行时标准内容目录（<CONTENT_DATA_DIR>/standard）也要指到空临时目录，
    // 否则本地跑过上传流程后 data/ 里会多出内容，污染断言。
    delete process.env.CONTENT_DIR;
    const emptyDataDir = mkdtempSync(path.join(tmpdir(), "packs-test-"));
    process.env.CONTENT_DATA_DIR = emptyDataDir;
    try {
      const units = listContent();
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
    } finally {
      delete process.env.CONTENT_DATA_DIR;
      rmSync(emptyDataDir, { recursive: true, force: true });
    }
  });
});
