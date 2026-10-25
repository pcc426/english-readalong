import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { openDb, type Db } from "@/lib/db";
import { setupDb, sessionCookieFor } from "@/lib/testing/auth-test-utils";
import {
  createDraft,
  completeTranscription,
  getDraft,
  setDraftVideo,
  type Draft,
  type DraftSentence,
} from "./repo";
import { createStandardDraft } from "./standard-drafts";
import {
  buildContentPack,
  finalizeDraft,
  FinalizeValidationError,
  packPathFor,
  standardPackPathFor,
  validateDraftSentences,
} from "./finalize";

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const fn of cleanups) fn();
  cleanups.length = 0;
  delete process.env.CONTENT_DATA_DIR;
});

function setupEnv(): Db {
  const db = setupDb("ra-finalize");
  const contentDataDir = mkdtempSync(path.join(tmpdir(), "ra-pack-"));
  process.env.CONTENT_DATA_DIR = contentDataDir;
  cleanups.push(() => rmSync(contentDataDir, { recursive: true, force: true }));
  return db;
}

/** sessionCookieFor 惰性建号；这里显式拿账号 id 供落草稿用 */
function accountIdOf(email: string, isAdmin = false): string {
  sessionCookieFor(email, isAdmin);
  const db = openDb(process.env.DB_PATH!);
  const row = db.prepare("SELECT id FROM accounts WHERE email = ?").get(email) as {
    id: string;
  };
  db.close();
  return row.id;
}

/** 直接经 repo 落一个 proofreading 草稿（句子原样入表，可构造非法数据） */
function seedProofreading(
  db: Db,
  accountId: string,
  sentences: Array<{ text: string; startMs: number; endMs: number }>
): Draft {
  const draft = createDraft(db, { accountId, title: "家里的英语" });
  setDraftVideo(db, draft.id, `${accountId}/${draft.id}.mp4`);
  completeTranscription(db, draft.id, sentences);
  return getDraft(db, draft.id)!;
}

function sent(
  index: number,
  text: string,
  startMs: number,
  endMs: number
): DraftSentence {
  return { index, text, startMs, endMs, proofread: "auto" };
}

describe("validateDraftSentences", () => {
  it("空草稿：报草稿级问题（index 为 null）", () => {
    const issues = validateDraftSentences([]);
    expect(issues).toHaveLength(1);
    expect(issues[0].index).toBeNull();
    expect(issues[0].problem).toContain("句子");
  });

  it("逐句指出缺文本与起止非法，合法句不报", () => {
    const issues = validateDraftSentences([
      sent(0, "hello", 0, 900),
      sent(1, "   ", 1000, 1800),
      sent(2, "world", 2000, 2000),
    ]);
    expect(issues).toHaveLength(2);
    expect(issues[0].index).toBe(1);
    expect(issues[0].problem).toContain("文本");
    expect(issues[1].index).toBe(2);
    expect(issues[1].problem).toContain("起止");
  });
});

describe("buildContentPack", () => {
  const draft: Draft = {
    id: "d-1",
    accountId: "acc-1",
    title: "家里的英语",
    type: "custom",
    status: "proofreading",
    videoPath: "acc-1/v.mp4",
    transcribeTaskId: null,
    transcribeError: null,
    createdAt: "",
    updatedAt: "",
  };

  it("毫秒 → 秒：0/900/1234/2345 → 0/0.9/1.2/2.3（一位小数精度）", () => {
    const pack = buildContentPack(draft, [
      sent(0, "a", 0, 900),
      sent(1, "b", 1234, 2345),
    ]);
    expect(pack.sentences).toEqual([
      { text: "a", start: 0, end: 0.9 },
      { text: "b", start: 1.2, end: 2.3 },
    ]);
  });

  it("带 type/owner 归属标记，title 取草稿标题，video 沿用草稿的视频引用", () => {
    const pack = buildContentPack(draft, [sent(0, "a", 0, 900)]);
    expect(pack.id).toBe("d-1");
    expect(pack.title).toBe("家里的英语");
    expect(pack.type).toBe("custom");
    expect(pack.owner).toBe("acc-1");
    expect(pack.video).toBe("acc-1/v.mp4");
    expect(pack.source).toBeTruthy();
  });
});

describe("finalizeDraft", () => {
  it("合法草稿：内容包写入账号目录且字段/秒换算正确，状态置 published", () => {
    const db = setupEnv();
    const accountId = accountIdOf("parent@test.com");
    const draft = seedProofreading(db, accountId, [
      { text: "hello", startMs: 0, endMs: 900 },
      { text: "world", startMs: 1234, endMs: 2345 },
    ]);

    const pack = finalizeDraft(db, draft);
    expect(pack).toMatchObject({
      id: draft.id,
      title: "家里的英语",
      type: "custom",
      owner: accountId,
    });

    // 落点契约：<customContentRoot>/<accountId>/<draftId>.json
    const abs = packPathFor(accountId, draft.id);
    expect(existsSync(abs)).toBe(true);
    const onDisk = JSON.parse(readFileSync(abs, "utf8"));
    expect(onDisk).toEqual(pack);
    expect(onDisk.video).toBe(`${accountId}/${draft.id}.mp4`);
    expect(onDisk.sentences).toEqual([
      { text: "hello", start: 0, end: 0.9 },
      { text: "world", start: 1.2, end: 2.3 },
    ]);

    expect(getDraft(db, draft.id)?.status).toBe("published");
  });

  it("校验失败：抛 FinalizeValidationError 带逐句问题，不写文件也不改状态", () => {
    const db = setupEnv();
    const accountId = accountIdOf("parent@test.com");
    const draft = seedProofreading(db, accountId, [
      { text: "hello", startMs: 0, endMs: 900 },
      { text: "", startMs: 1000, endMs: 800 },
    ]);

    expect(() => finalizeDraft(db, draft)).toThrow(FinalizeValidationError);
    expect(existsSync(packPathFor(accountId, draft.id))).toBe(false);
    expect(getDraft(db, draft.id)?.status).toBe("proofreading");

    try {
      finalizeDraft(db, draft);
    } catch (err) {
      const issues = (err as FinalizeValidationError).issues;
      expect(issues).toHaveLength(2);
      expect(issues[0]).toMatchObject({ index: 1 });
      expect(issues[0].problem).toContain("文本");
      expect(issues[1]).toMatchObject({ index: 1 });
      expect(issues[1].problem).toContain("起止");
    }
  });

  it("空草稿（没有句子）同样校验失败，不产生半成品", () => {
    const db = setupEnv();
    const accountId = accountIdOf("parent@test.com");
    const draft = seedProofreading(db, accountId, []);

    try {
      finalizeDraft(db, draft);
      expect.unreachable("应当抛出 FinalizeValidationError");
    } catch (err) {
      expect(err).toBeInstanceOf(FinalizeValidationError);
      expect((err as FinalizeValidationError).issues[0].index).toBeNull();
    }
    expect(existsSync(packPathFor(accountId, draft.id))).toBe(false);
  });
});

describe("buildContentPack · 标准内容（12 号票）", () => {
  const stdDraft: Draft = {
    id: "std-1",
    accountId: "admin-1",
    title: "五上 U2 Story time",
    type: "standard",
    status: "proofreading",
    videoPath: "admin-1/v.mp4",
    transcribeTaskId: null,
    transcribeError: null,
    createdAt: "",
    updatedAt: "",
  };

  it("type=standard：owner 置空、source=standard-upload，视频沿用草稿引用", () => {
    const pack = buildContentPack(stdDraft, [sent(0, "a", 0, 900)]);
    expect(pack.id).toBe("std-1");
    expect(pack.title).toBe("五上 U2 Story time");
    expect(pack.type).toBe("standard");
    expect(pack.owner).toBeNull();
    expect(pack.source).toBe("standard-upload");
    expect(pack.video).toBe("admin-1/v.mp4");
  });
});

describe("finalizeDraft · 标准内容（12 号票）", () => {
  /** 经真实链路落一个 proofreading 标准草稿（管理员账号） */
  function seedStandardDraft(
    db: Db,
    adminId: string,
    sentences: Array<{ text: string; startMs: number; endMs: number }>
  ): Draft {
    const draft = createStandardDraft(db, {
      accountId: adminId,
      title: "五上 U2 Story time",
      unitId: "五上-U2",
      moduleKind: "Story time",
    });
    setDraftVideo(db, draft.id, `${adminId}/${draft.id}.mp4`);
    completeTranscription(db, draft.id, sentences);
    return getDraft(db, draft.id)!;
  }

  it("标准草稿定稿：包落在运行时标准目录（与账号目录平级）、owner 为空，状态置 published", () => {
    const db = setupEnv();
    const adminId = accountIdOf("admin@test.com", true);
    const draft = seedStandardDraft(db, adminId, [
      { text: "hello", startMs: 0, endMs: 900 },
      { text: "world", startMs: 1234, endMs: 2345 },
    ]);

    const pack = finalizeDraft(db, draft);
    expect(pack.type).toBe("standard");
    expect(pack.owner).toBeNull();

    // 落点契约：<customContentRoot>/standard/<draftId>.json（不进管理员账号目录）
    const abs = standardPackPathFor(draft.id);
    expect(existsSync(abs)).toBe(true);
    expect(abs).toContain(path.join("standard", `${draft.id}.json`));
    const onDisk = JSON.parse(readFileSync(abs, "utf8"));
    expect(onDisk).toEqual(pack);
    expect(onDisk.video).toBe(`${adminId}/${draft.id}.mp4`);

    // 不写进账号自定义目录
    expect(existsSync(packPathFor(adminId, draft.id))).toBe(false);
    expect(getDraft(db, draft.id)?.status).toBe("published");
  });

  it("标准草稿校验失败同样不产生半成品", () => {
    const db = setupEnv();
    const adminId = accountIdOf("admin@test.com", true);
    const draft = seedStandardDraft(db, adminId, []);
    expect(() => finalizeDraft(db, draft)).toThrow(FinalizeValidationError);
    expect(existsSync(standardPackPathFor(draft.id))).toBe(false);
    expect(getDraft(db, draft.id)?.status).toBe("proofreading");
  });
});
