import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { listUnitPacks } from "./loader";

function makePackDir(files: Record<string, string>): string {
  const dir = mkdtempSync(path.join(tmpdir(), "readalong-packs-"));
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(path.join(dir, name), content, "utf8");
  }
  return dir;
}

const validPack = {
  id: "u2-dragon-dance",
  title: "The dragon dance",
  source: "沪教版五上 Unit 2 · Story time",
  video: "五上_U2.mp4",
  sentences: [
    { text: "Minmin, listen to the music and follow it.", start: null, end: null },
  ],
};

describe("内容包校验", () => {
  it("缺字段的内容包报明确错误（含文件名）", () => {
    const dir = makePackDir({ "bad.json": JSON.stringify({ id: "x" }) });
    try {
      expect(() => listUnitPacks(dir)).toThrow(/bad\.json/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("坏 JSON 报明确错误（含文件名）", () => {
    const dir = makePackDir({ "broken.json": "{ not json" });
    try {
      expect(() => listUnitPacks(dir)).toThrow(/broken\.json/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("时间倒置（start ≥ end）报明确错误", () => {
    const inverted = {
      ...validPack,
      id: "u3",
      sentences: [{ text: "hello", start: 5, end: 3 }],
    };
    const dir = makePackDir({ "u3.json": JSON.stringify(inverted) });
    try {
      expect(() => listUnitPacks(dir)).toThrow(/时间倒置|u3\.json/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("start 与 end 只允许成对出现或同时为空", () => {
    const halfTimed = {
      ...validPack,
      id: "u3",
      sentences: [{ text: "hello", start: 1.5, end: null }],
    };
    const dir = makePackDir({ "u3.json": JSON.stringify(halfTimed) });
    try {
      expect(() => listUnitPacks(dir)).toThrow(/u3\.json/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("内容包加载", () => {
  it("加载合法内容包，返回单元与句子", () => {
    const dir = makePackDir({ "u2.json": JSON.stringify(validPack) });
    try {
      const units = listUnitPacks(dir);
      expect(units).toHaveLength(1);
      expect(units[0].id).toBe("u2-dragon-dance");
      expect(units[0].title).toBe("The dragon dance");
      expect(units[0].source).toBe("沪教版五上 Unit 2 · Story time");
      expect(units[0].sentences).toHaveLength(1);
      expect(units[0].sentences[0].text).toBe(
        "Minmin, listen to the music and follow it."
      );
      expect(units[0].sentences[0].start).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
