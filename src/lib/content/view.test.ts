import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { getContentDetail, getContentOverview } from "./view";

// 与练习路由测试同口径：临时目录 + 环境缝驱动，不 mock 文件系统
const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const fn of cleanups) fn();
  cleanups.length = 0;
  delete process.env.CONTENT_DIR;
  delete process.env.CONTENT_DATA_DIR;
  delete process.env.DB_PATH;
});

function setupEnv(standard: Record<string, unknown>): void {
  const contentDir = mkdtempSync(path.join(tmpdir(), "ra-view-"));
  const dataDir = mkdtempSync(path.join(tmpdir(), "ra-view-data-"));
  const dbDir = mkdtempSync(path.join(tmpdir(), "ra-view-db-"));
  for (const [name, pack] of Object.entries(standard)) {
    writeFileSync(path.join(contentDir, name), JSON.stringify(pack), "utf8");
  }
  process.env.CONTENT_DIR = contentDir;
  process.env.CONTENT_DATA_DIR = dataDir;
  process.env.DB_PATH = path.join(dbDir, "readalong.db");
  cleanups.push(() => {
    rmSync(contentDir, { recursive: true, force: true });
    rmSync(dataDir, { recursive: true, force: true });
    rmSync(dbDir, { recursive: true, force: true });
  });
}

const attributed = {
  id: "u2-dragon-dance",
  title: "The dragon dance",
  source: "standard-upload",
  video: "五上_U2.mp4",
  type: "standard",
  owner: null,
  seriesCode: "sh-jiaoban-new",
  bookId: "grade5a",
  unitNo: 2,
  moduleKind: "Story time",
  lessonTitle: "The dragon dance",
  sentences: [
    { text: "Stop!", start: 5, end: 6.05 },
    { text: "Let's try again.", start: 15.78, end: 17.37 },
  ],
};

describe("内容视图透出教材归属与枚举副标题（票 03）", () => {
  it("列表视图：带归属字段的标准包透出排序字段 + 枚举副标题", () => {
    setupEnv({ "u2.json": attributed });
    const overview = getContentOverview().find((u) => u.id === "u2-dragon-dance");
    expect(overview).toMatchObject({
      seriesCode: "sh-jiaoban-new",
      bookId: "grade5a",
      unitNo: 2,
      moduleKind: "Story time",
      subtitle: "沪教版五上-Unit2-Story time-2句",
    });
  });

  it("未迁移老包（无归属字段）与自定义包：排序字段与副标题都是 null", () => {
    setupEnv({
      "u2.json": {
        id: "u2-dragon-dance",
        title: "The dragon dance",
        source: "沪教版五上 Unit 2 · Story time",
        video: "五上_U2.mp4",
        sentences: [{ text: "Stop!", start: 5, end: 6.05 }],
      },
    });
    const overview = getContentOverview().find((u) => u.id === "u2-dragon-dance");
    expect(overview).toMatchObject({
      seriesCode: null,
      bookId: null,
      unitNo: null,
      moduleKind: null,
      subtitle: null,
    });
  });

  it("详情视图：带归属的标准包副标题为枚举串，练习页据此替换 sourceLabel", () => {
    setupEnv({ "u2.json": attributed });
    const detail = getContentDetail("u2-dragon-dance");
    expect(detail?.subtitle).toBe("沪教版五上-Unit2-Story time-2句");
  });

  it("自定义包详情副标题为 null（练习页回退 sourceLabel 文案）", () => {
    setupEnv({
      "u2.json": {
        ...attributed,
        type: "custom",
        owner: "acc-1",
      },
    });
    const detail = getContentDetail("u2-dragon-dance", { accountId: "acc-1" });
    expect(detail?.subtitle).toBeNull();
  });
});
