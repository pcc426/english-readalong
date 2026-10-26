import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { POST } from "./route";
import { openDb, type Db } from "@/lib/db";
import {
  setupDb,
  sessionCookieFor,
} from "@/lib/testing/auth-test-utils";
import {
  createDraft,
  completeTranscription,
  getDraft,
  listDraftSentences,
  setDraftVideo,
  setTranscribeError,
} from "@/lib/drafts/repo";
import { setTranscriptionService } from "@/lib/drafts/transcription/current";
import { setTranscriptionPoller } from "@/lib/drafts/transcription/poller";
import { FakeTranscriptionService } from "@/lib/drafts/transcription/fake";
import type {
  TranscriptionPollResult,
  TranscriptionService,
  TranscriptionTask,
} from "@/lib/drafts/transcription/types";

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const fn of cleanups) fn();
  cleanups.length = 0;
  delete process.env.DB_PATH;
  delete process.env.UPLOADS_DIR;
  setTranscriptionService(null);
  setTranscriptionPoller(null);
  vi.restoreAllMocks();
});

function setupEnv(): Db {
  const db = setupDb("ra-retry");
  const uploadsDir = mkdtempSync(path.join(tmpdir(), "ra-uploads-"));
  process.env.UPLOADS_DIR = uploadsDir;
  cleanups.push(() => rmSync(uploadsDir, { recursive: true, force: true }));
  return db;
}

function accountIdOf(email: string): string {
  sessionCookieFor(email);
  const db = openDb(process.env.DB_PATH!);
  try {
    const row = db.prepare("SELECT id FROM accounts WHERE email = ?").get(email) as {
      id: string;
    };
    return row.id;
  } finally {
    db.close();
  }
}

/** 建一个停在 transcribing 且带转写错误的草稿（重试的前置状态） */
function seedFailedDraft(db: Db, accountId: string, title = "转写失败的"): string {
  const draft = createDraft(db, { accountId, title });
  setDraftVideo(db, draft.id, `${accountId}/${draft.id}.mp4`);
  setTranscribeError(db, draft.id, "讯飞转写失败（failType=3 识别失败）");
  return draft.id;
}

function post(id: string, cookie: string): Promise<Response> {
  return POST(
    new Request(`http://x/api/drafts/${id}/retry-transcription`, {
      method: "POST",
      headers: { cookie },
    }),
    { params: Promise.resolve({ id }) }
  );
}

describe("POST /api/drafts/[id]/retry-transcription", () => {
  it("未登录 401", async () => {
    setupEnv();
    const res = await post("whatever", "session=forged-id");
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("UNAUTHORIZED");
  });

  it("他人与不存在的草稿一律 404，不暴露存在性", async () => {
    const db = setupEnv();
    accountIdOf("parent@test.com");
    const otherId = accountIdOf("other@test.com");
    const id = seedFailedDraft(db, otherId);

    const res = await post(id, sessionCookieFor("parent@test.com"));
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("DRAFT_NOT_FOUND");

    const missing = await post("missing-id", sessionCookieFor("parent@test.com"));
    expect(missing.status).toBe(404);
  });

  it("没有失败过的 transcribing 草稿：409（重试无从谈起）", async () => {
    const db = setupEnv();
    const mine = accountIdOf("parent@test.com");
    const draft = createDraft(db, { accountId: mine, title: "转写中无错误" });

    const res = await post(draft.id, sessionCookieFor("parent@test.com"));
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("RETRY_NOT_AVAILABLE");
  });

  it("已校对与已发布的草稿：409（即使残留历史错误，状态门禁优先）", async () => {
    const db = setupEnv();
    const mine = accountIdOf("parent@test.com");
    const draft = createDraft(db, { accountId: mine, title: "校对中" });
    setDraftVideo(db, draft.id, `${mine}/${draft.id}.mp4`);
    completeTranscription(db, draft.id, [
      { text: "hello", startMs: 0, endMs: 900 },
    ]);
    setTranscribeError(db, draft.id, "历史错误");

    const res = await post(draft.id, sessionCookieFor("parent@test.com"));
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("RETRY_NOT_AVAILABLE");

    db.prepare("UPDATE content_drafts SET status = 'published' WHERE id = ?").run(draft.id);
    const res2 = await post(draft.id, sessionCookieFor("parent@test.com"));
    expect(res2.status).toBe(409);
  });

  it("失败过的草稿重试成功（fake 立即完成）：200 返回新状态，句子落库错误清空", async () => {
    const db = setupEnv();
    const mine = accountIdOf("parent@test.com");
    const id = seedFailedDraft(db, mine);
    // fake 转写器单实例注入：submit/poll 共享任务表（与上传链路测试同约定）
    setTranscriptionService(new FakeTranscriptionService());

    const res = await post(id, sessionCookieFor("parent@test.com"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.draft).toEqual({
      id,
      status: "proofreading",
      transcribeError: null,
    });

    const after = getDraft(db, id)!;
    expect(after.status).toBe("proofreading");
    expect(after.transcribeError).toBeNull();
    expect(listDraftSentences(db, id).length).toBeGreaterThan(0);
  });

  it("重试仍失败：200 但错误更新、草稿保持 transcribing（可再试）", async () => {
    const db = setupEnv();
    const mine = accountIdOf("parent@test.com");
    const id = seedFailedDraft(db, mine);

    const failing: TranscriptionService = {
      async submit(): Promise<TranscriptionTask> {
        throw new Error("26601 非法应用信息");
      },
      async poll(): Promise<TranscriptionPollResult> {
        throw new Error("不应走到 poll");
      },
    };
    setTranscriptionService(failing);

    const res = await post(id, sessionCookieFor("parent@test.com"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.draft.status).toBe("transcribing");
    expect(body.draft.transcribeError).toContain("26601");

    const after = getDraft(db, id)!;
    expect(after.status).toBe("transcribing");
    expect(after.transcribeError).toContain("26601");
  });
});
