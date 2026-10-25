import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { setupDb } from "@/lib/testing/auth-test-utils";
import { openDb } from "@/lib/db";
import { createAccount } from "@/lib/auth/accounts";
import { setTranscriptionService } from "./transcription/current";
import {
  FakeTranscriptionService,
  fakeTranscriptSentences,
} from "./transcription/fake";
import {
  createStandardDraft,
  createStandardDraftWithTranscription,
  draftModuleMapByAccount,
  getDraftModule,
} from "./standard-drafts";
import { getDraft } from "./repo";

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const fn of cleanups) fn();
  cleanups.length = 0;
  delete process.env.DB_PATH;
  delete process.env.UPLOADS_DIR;
  setTranscriptionService(null);
});

function setupEnv() {
  const db = setupDb("ra-std-draft");
  // 外键约束需要真实账号行
  createAccount(db, { email: "admin@test.com", password: "secret123" });
  createAccount(db, { email: "other@test.com", password: "secret123" });
  const uploadsDir = mkdtempSync(path.join(tmpdir(), "ra-std-up-"));
  process.env.UPLOADS_DIR = uploadsDir;
  cleanups.push(() => rmSync(uploadsDir, { recursive: true, force: true }));
  return db;
}

function accountIdOf(db: ReturnType<typeof openDb>, email: string): string {
  const row = db.prepare("SELECT id FROM accounts WHERE email = ?").get(email) as {
    id: string;
  };
  return row.id;
}

describe("createStandardDraft", () => {
  it("建出 type=standard 且带 unit_id/module_kind 的 transcribing 草稿", () => {
    const db = setupEnv();
    const draft = createStandardDraft(db, {
      accountId: accountIdOf(db, "admin@test.com"),
      title: "五上 U2 Story time",
      unitId: "五上-U2",
      moduleKind: "Story time",
    });
    expect(draft.type).toBe("standard");
    expect(draft.status).toBe("transcribing");
    expect(draft.title).toBe("五上 U2 Story time");

    const row = db
      .prepare("SELECT type, unit_id, module_kind FROM content_drafts WHERE id = ?")
      .get(draft.id) as { type: string; unit_id: string; module_kind: string };
    expect(row).toEqual({
      type: "standard",
      unit_id: "五上-U2",
      module_kind: "Story time",
    });
  });
});

describe("getDraftModule", () => {
  it("标准草稿返回单元/栏目引用，custom 草稿与不存在的草稿返回 null", () => {
    const db = setupEnv();
    const std = createStandardDraft(db, {
      accountId: accountIdOf(db, "admin@test.com"),
      title: "标准",
      unitId: "五上-U1",
      moduleKind: "Talking time",
    });
    expect(getDraftModule(db, std.id)).toEqual({
      unitId: "五上-U1",
      moduleKind: "Talking time",
    });
    expect(getDraftModule(db, "missing")).toBeNull();
  });
});

describe("draftModuleMapByAccount", () => {
  it("只含该账号草稿的引用映射，custom 草稿不出现在 Map 里", () => {
    const db = setupEnv();
    const mine = createStandardDraft(db, {
      accountId: accountIdOf(db, "admin@test.com"),
      title: "我的标准",
      unitId: "五上-U2",
      moduleKind: "Story time",
    });
    createStandardDraft(db, {
      accountId: accountIdOf(db, "other@test.com"),
      title: "别人家的标准",
      unitId: "五上-U3",
      moduleKind: "Chant time",
    });
    // acc-1 的 custom 草稿（走 repo 建行，无 unit/module）
    db.prepare(
      `INSERT INTO content_drafts (id, account_id, title, video_path)
       VALUES ('custom-1', ?, '自定义', 'x/v.mp4')`
    ).run(accountIdOf(db, "admin@test.com"));

    const map = draftModuleMapByAccount(db, accountIdOf(db, "admin@test.com"));
    expect(map.size).toBe(1);
    expect(map.get(mine.id)).toEqual({
      unitId: "五上-U2",
      moduleKind: "Story time",
    });
  });
});

describe("createStandardDraftWithTranscription", () => {
  it("建标准草稿 → 落视频引用 → 假转写完成后句子落库、状态置 proofreading", async () => {
    const db = setupEnv();
    setTranscriptionService(new FakeTranscriptionService());

    const draft = await createStandardDraftWithTranscription(db, {
      accountId: accountIdOf(db, "admin@test.com"),
      title: "五上 U2 Story time",
      videoPath: "x/v.mp4",
      unitId: "五上-U2",
      moduleKind: "Story time",
    });

    expect(draft.status).toBe("proofreading");
    expect(draft.videoPath).toBe("x/v.mp4");
    expect(getDraftModule(db, draft.id)).toEqual({
      unitId: "五上-U2",
      moduleKind: "Story time",
    });
    expect(getDraft(db, draft.id)?.status).toBe("proofreading");
    const sentences = db
      .prepare("SELECT COUNT(*) AS n FROM draft_sentences WHERE draft_id = ?")
      .get(draft.id) as { n: number };
    expect(sentences.n).toBe(fakeTranscriptSentences().length);
  });
});
