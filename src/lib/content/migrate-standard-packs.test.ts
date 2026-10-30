import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { contentPackSchema } from "./schema";
import {
  migrateStandardPack,
  type PackMigrationTarget,
} from "./migrate-standard-packs";

const cleanups: string[] = [];
afterEach(() => {
  for (const dir of cleanups) rmSync(dir, { recursive: true, force: true });
  cleanups.length = 0;
});

function tempDir(prefix: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  cleanups.push(dir);
  return dir;
}

/** 未迁移形态的最小标准包（老包：无归属字段、type 缺省视为 standard） */
const legacyPack = {
  id: "u2-dragon-dance",
  title: "The dragon dance",
  source: "沪教版五上 Unit 2 · Story time",
  video: "五上_U2.mp4",
  sentences: [
    { text: "Stop!", start: 5, end: 6.05 },
    { text: "Let's try again.", start: 15.78, end: 17.37 },
  ],
};

const u2Target: PackMigrationTarget = {
  unitId: "五上-U2",
  moduleKind: "Story time",
  poster: null,
};

function writePack(dir: string, pack: unknown, name = "pack.json"): string {
  const abs = path.join(dir, name);
  writeFileSync(abs, JSON.stringify(pack, null, 2), "utf8");
  return abs;
}

describe("migrateStandardPack（老标准包归属回填引擎，票 03）", () => {
  it("未迁移老包：写全归属字段（注册表反查课文名），其余字段原样保留", () => {
    const abs = writePack(tempDir("ra-mig-"), legacyPack);
    const result = migrateStandardPack(abs, u2Target, { apply: true });
    expect(result.status).toBe("migrated");
    expect(result.before).toEqual({});
    expect(result.after).toMatchObject({
      seriesCode: "sh-jiaoban-new",
      bookId: "grade5a",
      unitNo: 2,
      moduleKind: "Story time",
      lessonTitle: "The dragon dance",
    });
    expect(result.after?.poster).toBeUndefined();

    const onDisk = JSON.parse(readFileSync(abs, "utf8"));
    expect(contentPackSchema.safeParse(onDisk).success).toBe(true);
    expect(onDisk).toMatchObject({
      id: "u2-dragon-dance",
      title: "The dragon dance",
      video: "五上_U2.mp4",
      seriesCode: "sh-jiaoban-new",
      bookId: "grade5a",
      unitNo: 2,
      moduleKind: "Story time",
      lessonTitle: "The dragon dance",
    });
    expect(onDisk.sentences).toHaveLength(2);
    expect(onDisk.poster).toBeUndefined();
  });

  it("dry-run（apply 缺省）：只给 before/after 计划，不动磁盘", () => {
    const dir = tempDir("ra-mig-");
    const abs = writePack(dir, legacyPack);
    const result = migrateStandardPack(abs, u2Target);
    expect(result.status).toBe("planned");
    expect(result.before).toEqual({});
    expect(result.after).toMatchObject({ unitNo: 2, lessonTitle: "The dragon dance" });
    expect(readFileSync(abs, "utf8")).toBe(JSON.stringify(legacyPack, null, 2));
  });

  it("幂等：字段已正确则 skipped（poster 目标为 null 时已有 poster 也算正确）", () => {
    const dir = tempDir("ra-mig-");
    const migrated = {
      ...legacyPack,
      seriesCode: "sh-jiaoban-new",
      bookId: "grade5a",
      unitNo: 2,
      moduleKind: "Story time",
      lessonTitle: "The dragon dance",
    };
    const abs = writePack(dir, migrated);
    const raw = readFileSync(abs, "utf8");
    const result = migrateStandardPack(abs, u2Target, { apply: true });
    expect(result.status).toBe("skipped");
    expect(readFileSync(abs, "utf8")).toBe(raw);
  });

  it("归属字段错值会被纠正为注册表值（幂等按「正确」而非「存在」判定）", () => {
    const dir = tempDir("ra-mig-");
    const abs = writePack(dir, {
      ...legacyPack,
      seriesCode: "wrong",
      bookId: "grade5b",
      unitNo: 9,
      moduleKind: "Song time",
      lessonTitle: "Wrong title",
    });
    const result = migrateStandardPack(abs, u2Target, { apply: true });
    expect(result.status).toBe("migrated");
    const onDisk = JSON.parse(readFileSync(abs, "utf8"));
    expect(onDisk).toMatchObject({
      seriesCode: "sh-jiaoban-new",
      bookId: "grade5a",
      unitNo: 2,
      moduleKind: "Story time",
      lessonTitle: "The dragon dance",
    });
  });

  it("poster 引用随归属一起补写；已正确则 skipped", () => {
    const dir = tempDir("ra-mig-");
    const abs = writePack(dir, legacyPack);
    const withPoster = migrateStandardPack(abs, { ...u2Target, poster: "五上_U2.jpg" }, {
      apply: true,
    });
    expect(withPoster.status).toBe("migrated");
    expect(withPoster.after?.poster).toBe("五上_U2.jpg");
    expect(JSON.parse(readFileSync(abs, "utf8")).poster).toBe("五上_U2.jpg");

    const second = migrateStandardPack(abs, { ...u2Target, poster: "五上_U2.jpg" }, {
      apply: true,
    });
    expect(second.status).toBe("skipped");
  });

  it("poster 目标为 null（封面文件暂缺）时保留包上已有引用，只增不删", () => {
    const dir = tempDir("ra-mig-");
    const abs = writePack(dir, {
      ...legacyPack,
      seriesCode: "sh-jiaoban-new",
      bookId: "grade5a",
      unitNo: 2,
      moduleKind: "Story time",
      lessonTitle: "The dragon dance",
      poster: "五上_U2.jpg",
    });
    const result = migrateStandardPack(abs, u2Target, { apply: true });
    expect(result.status).toBe("skipped");
    expect(JSON.parse(readFileSync(abs, "utf8")).poster).toBe("五上_U2.jpg");
  });

  it("type=custom 的包拒绝迁移（引擎只管标准包）", () => {
    const dir = tempDir("ra-mig-");
    const abs = writePack(dir, { ...legacyPack, type: "custom", owner: "acc-1" });
    const result = migrateStandardPack(abs, u2Target, { apply: true });
    expect(result.status).toBe("failed");
    expect(result.problem).toContain("自定义");
    expect(JSON.parse(readFileSync(abs, "utf8")).seriesCode).toBeUndefined();
  });

  it("注册表查不到目标归属：failed 且不动磁盘", () => {
    const dir = tempDir("ra-mig-");
    const abs = writePack(dir, legacyPack);
    const result = migrateStandardPack(
      abs,
      { unitId: "五上-U99", moduleKind: "Story time", poster: null },
      { apply: true }
    );
    expect(result.status).toBe("failed");
    expect(result.problem).toContain("注册表");
    expect(readFileSync(abs, "utf8")).toBe(JSON.stringify(legacyPack, null, 2));
  });

  it("坏 JSON / 现有包校验不过：failed，不写盘", () => {
    const dir = tempDir("ra-mig-");
    const broken = path.join(dir, "broken.json");
    writeFileSync(broken, "{ not json", "utf8");
    expect(migrateStandardPack(broken, u2Target, { apply: true }).status).toBe("failed");

    const invalid = writePack(dir, { ...legacyPack, sentences: "nope" }, "invalid.json");
    expect(migrateStandardPack(invalid, u2Target, { apply: true }).status).toBe("failed");
  });

  it("2 空格缩进写出，与现有内容包格式一致", () => {
    const abs = writePack(tempDir("ra-mig-"), legacyPack);
    migrateStandardPack(abs, u2Target, { apply: true });
    const raw = readFileSync(abs, "utf8");
    expect(raw.split("\n")[1]).toMatch(/^ {2}"id"/);
  });
});
