import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { getContent, listContent } from "./loader";

// 测试通过 listContent/getContent 缝 + 临时目录环境变量驱动，不 mock 文件系统
const cleanups: string[] = [];
afterEach(() => {
  for (const dir of cleanups) rmSync(dir, { recursive: true, force: true });
  cleanups.length = 0;
  delete process.env.CONTENT_DIR;
  delete process.env.CONTENT_DATA_DIR;
});

function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  cleanups.push(dir);
  return dir;
}

function writePacks(dir: string, files: Record<string, string>): void {
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(path.join(dir, name), content, "utf8");
  }
}

/**
 * 布置内容环境：标准目录（CONTENT_DIR）+ 自定义根目录（CONTENT_DATA_DIR），
 * custom 为 账号 id → 该账号目录下的内容包文件。
 */
function setupContentEnv(
  standard: Record<string, string>,
  custom: Record<string, Record<string, string>> = {}
): void {
  const standardDir = makeTempDir("readalong-packs-");
  writePacks(standardDir, standard);
  const customRoot = makeTempDir("readalong-custom-");
  for (const [accountId, files] of Object.entries(custom)) {
    const accountDir = path.join(customRoot, accountId);
    mkdirSync(accountDir);
    writePacks(accountDir, files);
  }
  process.env.CONTENT_DIR = standardDir;
  process.env.CONTENT_DATA_DIR = customRoot;
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
    setupContentEnv({ "bad.json": JSON.stringify({ id: "x" }) });
    expect(() => listContent()).toThrow(/bad\.json/);
  });

  it("坏 JSON 报明确错误（含文件名）", () => {
    setupContentEnv({ "broken.json": "{ not json" });
    expect(() => listContent()).toThrow(/broken\.json/);
  });

  it("时间倒置（start ≥ end）报明确错误", () => {
    const inverted = {
      ...validPack,
      id: "u3",
      sentences: [{ text: "hello", start: 5, end: 3 }],
    };
    setupContentEnv({ "u3.json": JSON.stringify(inverted) });
    expect(() => listContent()).toThrow(/时间倒置|u3\.json/);
  });

  it("start 与 end 只允许成对出现或同时为空", () => {
    const halfTimed = {
      ...validPack,
      id: "u3",
      sentences: [{ text: "hello", start: 1.5, end: null }],
    };
    setupContentEnv({ "u3.json": JSON.stringify(halfTimed) });
    expect(() => listContent()).toThrow(/u3\.json/);
  });

  it("type 缺省视为 standard：无 owner 的既有内容包通过校验", () => {
    setupContentEnv({ "u2.json": JSON.stringify(validPack) });
    expect(listContent()).toHaveLength(1);
  });

  it("type=standard + owner=null 通过校验", () => {
    setupContentEnv({
      "u2.json": JSON.stringify({ ...validPack, type: "standard", owner: null }),
    });
    expect(listContent()).toHaveLength(1);
  });

  it("type=standard 时 owner 必须为空", () => {
    setupContentEnv({
      "u2.json": JSON.stringify({ ...validPack, type: "standard", owner: "acc-1" }),
    });
    expect(() => listContent()).toThrow(/u2\.json/);
    expect(() => listContent()).toThrow(/owner/);
  });

  it("type=custom + owner=账号 id 通过校验", () => {
    setupContentEnv(
      {},
      { "acc-1": { "c1.json": JSON.stringify({ ...validPack, type: "custom", owner: "acc-1" }) } }
    );
    expect(listContent({ accountId: "acc-1" })).toHaveLength(1);
  });

  it("type=custom 时 owner 必须为非空账号 id（缺省与 null 都报错）", () => {
    const noOwner = { ...validPack, type: "custom" };
    const nullOwner = { ...validPack, type: "custom", owner: null };
    const emptyOwner = { ...validPack, type: "custom", owner: "" };
    for (const [name, pack] of [
      ["no-owner.json", noOwner],
      ["null-owner.json", nullOwner],
      ["empty-owner.json", emptyOwner],
    ] as const) {
      setupContentEnv({}, { "acc-1": { [name]: JSON.stringify(pack) } });
      expect(() => listContent({ accountId: "acc-1" })).toThrow(new RegExp(name.replace(".", "\\.")));
    }
  });
});

describe("内容加载", () => {
  it("加载合法内容包，返回内容包与句子", () => {
    setupContentEnv({ "u2.json": JSON.stringify(validPack) });
    const packs = listContent();
    expect(packs).toHaveLength(1);
    expect(packs[0].id).toBe("u2-dragon-dance");
    expect(packs[0].title).toBe("The dragon dance");
    expect(packs[0].source).toBe("沪教版五上 Unit 2 · Story time");
    expect(packs[0].sentences).toHaveLength(1);
    expect(packs[0].sentences[0].text).toBe(
      "Minmin, listen to the music and follow it."
    );
    expect(packs[0].sentences[0].start).toBeNull();
  });
});

describe("标准目录 + 自定义目录合并读取", () => {
  const standardPack = JSON.stringify(validPack);
  const customPackA = JSON.stringify({
    ...validPack,
    id: "custom-a1",
    title: "A 家的自定义内容",
    video: "a1.mp4",
    type: "custom",
    owner: "acc-a",
  });
  const customPackB = JSON.stringify({
    ...validPack,
    id: "custom-b1",
    title: "B 家的自定义内容",
    video: "b1.mp4",
    type: "custom",
    owner: "acc-b",
  });

  it("不传账号参数：仅标准内容，自定义目录存在也不合并", () => {
    setupContentEnv({ "u2.json": standardPack }, { "acc-a": { "a1.json": customPackA } });
    const packs = listContent();
    expect(packs.map((p) => p.id)).toEqual(["u2-dragon-dance"]);
  });

  it("传账号参数：标准内容 + 该账号自定义内容，带 type 与 owner", () => {
    setupContentEnv(
      { "u2.json": standardPack },
      { "acc-a": { "a1.json": customPackA } }
    );
    const packs = listContent({ accountId: "acc-a" });
    expect(packs.map((p) => p.id)).toEqual(["u2-dragon-dance", "custom-a1"]);
    expect(packs[1].type).toBe("custom");
    expect(packs[1].owner).toBe("acc-a");
  });

  it("账号过滤：别的账号的自定义内容不可见", () => {
    setupContentEnv(
      { "u2.json": standardPack },
      {
        "acc-a": { "a1.json": customPackA },
        "acc-b": { "b1.json": customPackB },
      }
    );
    expect(listContent({ accountId: "acc-b" }).map((p) => p.id)).toEqual([
      "u2-dragon-dance",
      "custom-b1",
    ]);
  });

  it("自定义目录缺失（运行时还没有任何上传）时带账号查询等于仅标准内容", () => {
    setupContentEnv({ "u2.json": standardPack });
    process.env.CONTENT_DATA_DIR = path.join(makeTempDir("readalong-empty-"), "not-exist");
    expect(listContent({ accountId: "acc-a" }).map((p) => p.id)).toEqual([
      "u2-dragon-dance",
    ]);
  });

  it("自定义内容包的 owner 与所在账号目录不一致时报错", () => {
    setupContentEnv({}, { "acc-b": { "a1.json": customPackA } });
    expect(() => listContent({ accountId: "acc-b" })).toThrow(/owner/);
  });

  it("自定义目录里的坏包同样报明确错误（含文件名）", () => {
    setupContentEnv({}, { "acc-a": { "broken.json": "{ not json" } });
    expect(() => listContent({ accountId: "acc-a" })).toThrow(/broken\.json/);
  });
});

describe("按 id 取单条", () => {
  const standardPack = JSON.stringify(validPack);
  const customPackA = JSON.stringify({
    ...validPack,
    id: "custom-a1",
    type: "custom",
    owner: "acc-a",
  });

  it("标准内容按 id 可取，不存在的 id 返回 null", () => {
    setupContentEnv({ "u2.json": standardPack });
    expect(getContent("u2-dragon-dance")?.title).toBe("The dragon dance");
    expect(getContent("nope")).toBeNull();
  });

  it("自定义内容仅归属账号可取：无账号与其他账号都取不到", () => {
    setupContentEnv(
      { "u2.json": standardPack },
      { "acc-a": { "a1.json": customPackA } }
    );
    expect(getContent("custom-a1")).toBeNull();
    expect(getContent("custom-a1", { accountId: "acc-b" })).toBeNull();
    expect(getContent("custom-a1", { accountId: "acc-a" })?.id).toBe("custom-a1");
  });
});

describe("标准双目录合并（12 号票：随代码目录 + 运行时目录）", () => {
  const runtimeStdPack = JSON.stringify({
    ...validPack,
    id: "std-runtime-1",
    title: "管理员制作的运行时标准内容",
    video: "acc-std/v.mp4",
    type: "standard",
    owner: null,
  });

  /** 在运行时标准目录（<customContentRoot>/standard/，与账号目录平级）落包 */
  function writeRuntimeStandard(files: Record<string, string>): void {
    const dir = path.join(process.env.CONTENT_DATA_DIR!, "standard");
    mkdirSync(dir, { recursive: true });
    writePacks(dir, files);
  }

  it("运行时标准目录的包对不传账号的查询可见（全账号可见的前提）", () => {
    setupContentEnv({});
    writeRuntimeStandard({ "s1.json": runtimeStdPack });
    expect(listContent().map((p) => p.id)).toEqual(["std-runtime-1"]);
  });

  it("传账号查询：随代码标准 + 运行时标准 + 本账号自定义全合并", () => {
    setupContentEnv(
      { "u2.json": JSON.stringify(validPack) },
      { "acc-a": { "a1.json": JSON.stringify({ ...validPack, id: "custom-a1", type: "custom", owner: "acc-a" }) } }
    );
    writeRuntimeStandard({ "s1.json": runtimeStdPack });
    expect(listContent({ accountId: "acc-a" }).map((p) => p.id)).toEqual([
      "u2-dragon-dance",
      "std-runtime-1",
      "custom-a1",
    ]);
  });

  it("同名 id 去重：随代码目录（content/units）优先，运行时副本被丢弃", () => {
    setupContentEnv({ "u2.json": JSON.stringify(validPack) });
    writeRuntimeStandard({
      "dup.json": JSON.stringify({
        ...validPack,
        title: "运行时同名包（应被丢弃）",
        type: "standard",
        owner: null,
      }),
    });
    const packs = listContent();
    expect(packs.map((p) => p.id)).toEqual(["u2-dragon-dance"]);
    expect(packs[0].title).toBe("The dragon dance");
  });

  it("运行时标准目录缺失（还没有管理员制作过）视为空，不报错", () => {
    setupContentEnv({ "u2.json": JSON.stringify(validPack) });
    expect(listContent().map((p) => p.id)).toEqual(["u2-dragon-dance"]);
    expect(getContent("std-runtime-1")).toBeNull();
  });

  it("运行时标准目录里的坏包同样报明确错误（含文件名）", () => {
    setupContentEnv({});
    writeRuntimeStandard({ "broken.json": "{ not json" });
    expect(() => listContent()).toThrow(/broken\.json/);
  });
});
