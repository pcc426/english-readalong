import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { POST } from "./route";
import { findAccountByEmail } from "@/lib/auth/accounts";
import {
  setupDb,
  sessionCookieFor,
} from "@/lib/testing/auth-test-utils";
import { setDurationProbe } from "@/lib/drafts/probe";
import { setTranscriptionService } from "@/lib/drafts/transcription/current";
import {
  FakeTranscriptionService,
  fakeTranscriptSentences,
} from "@/lib/drafts/transcription/fake";
import { MAX_UPLOAD_BYTES } from "@/lib/drafts/storage";
import type { Db } from "@/lib/db";

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const fn of cleanups) fn();
  cleanups.length = 0;
  delete process.env.DB_PATH;
  delete process.env.UPLOADS_DIR;
  setDurationProbe(null);
  setTranscriptionService(null);
});

function setupEnv(): Db {
  const db = setupDb("ra-up");
  const uploadsDir = mkdtempSync(path.join(tmpdir(), "ra-uploads-"));
  process.env.UPLOADS_DIR = uploadsDir;
  cleanups.push(() => rmSync(uploadsDir, { recursive: true, force: true }));
  return db;
}

function accountIdOf(db: Db): string {
  // 先确保账号已建（sessionCookieFor 惰性建号），再查 id
  sessionCookieFor("parent@test.com");
  const account = findAccountByEmail(db, "parent@test.com");
  if (!account) throw new Error("测试账号未创建");
  return account.id;
}

function mp4File(name = "lesson.mp4", type = "video/mp4"): File {
  return new File([new Uint8Array([0x00, 0x01, 0x02, 0x03])], name, { type });
}

/** 真 200MB+1 载荷：File 子类的 size 覆盖过不了 Request 的 multipart 序列化，
 * 只能用真实字节数把 413 这条边界钉住（单测约 0.6s，可接受） */
function oversizedFile(): File {
  return new File([new Uint8Array(MAX_UPLOAD_BYTES + 1)], "big.mp4", {
    type: "video/mp4",
  });
}

function post(title: unknown, file: unknown): Promise<Response> {
  const form = new FormData();
  if (title !== undefined) form.set("title", title as string);
  if (file !== undefined) form.set("file", file as File);
  return POST(
    new Request("http://x/api/uploads", {
      method: "POST",
      headers: { cookie: sessionCookieFor("parent@test.com") },
      body: form,
    })
  );
}

describe("POST /api/uploads", () => {
  it("未登录 401", async () => {
    setupEnv();
    const form = new FormData();
    form.set("title", "测试");
    form.set("file", mp4File());
    const res = await POST(
      new Request("http://x/api/uploads", { method: "POST", body: form })
    );
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("UNAUTHORIZED");
  });

  it("合法上传：201 { draft }，状态已是待校对，假转写句子与毫秒时间落库，视频落账号目录", async () => {
    const db = setupEnv();
    const accountId = accountIdOf(db);
    setDurationProbe(async () => 30_000);
    setTranscriptionService(new FakeTranscriptionService());

    const res = await post("我的第一个视频", mp4File());
    expect(res.status).toBe(201);
    const { draft } = await res.json();
    expect(draft.title).toBe("我的第一个视频");
    expect(draft.status).toBe("proofreading");

    // 草稿落库：归属、状态、视频引用（<accountId>/<uuid>.mp4）、任务引用
    const row = db
      .prepare("SELECT * FROM content_drafts WHERE id = ?")
      .get(draft.id) as {
      id: string;
      account_id: string;
      title: string;
      status: string;
      video_path: string;
      transcribe_task_id: string;
    };
    expect(row.account_id).toBe(accountId);
    expect(row.status).toBe("proofreading");
    expect(row.transcribe_task_id).toBeTruthy();

    // 视频按账号落 uploads 根目录，文件名 <uuid>.mp4，磁盘内容与上传一致
    const dir = path.join(process.env.UPLOADS_DIR!, accountId);
    const files = readdirSync(dir);
    expect(files).toEqual([path.basename(row.video_path)]);
    expect(files[0]).toMatch(/^[0-9a-f-]{36}\.mp4$/);
    expect(row.video_path).toBe(`${accountId}/${files[0]}`);
    expect(Array.from(readFileSync(path.join(dir, files[0])))).toEqual([
      0x00, 0x01, 0x02, 0x03,
    ]);

    const sentences = db
      .prepare(
        "SELECT seq, text, start_ms, end_ms, proofread FROM draft_sentences WHERE draft_id = ? ORDER BY seq"
      )
      .all(draft.id);
    expect(sentences).toEqual(
      fakeTranscriptSentences().map((s, index) => ({
        seq: index,
        text: s.text,
        start_ms: s.startMs,
        end_ms: s.endMs,
        proofread: "auto",
      }))
    );
  });

  it("超 200MB：413 TOO_LARGE，不落盘不建草稿", async () => {
    const db = setupEnv();
    const res = await post("太大", oversizedFile());
    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body.error.code).toBe("TOO_LARGE");
    expect(body.error.message).toContain("200MB");
    expect(readdirSync(process.env.UPLOADS_DIR!)).toEqual([]);
    expect(countDrafts(db)).toBe(0);
  });

  it("超 5 分钟（注入假 ffprobe）：400 TOO_LONG，磁盘文件与草稿都不留", async () => {
    const db = setupEnv();
    const accountId = accountIdOf(db);
    setDurationProbe(async () => 5 * 60 * 1000 + 1);

    const res = await post("太长", mp4File());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("TOO_LONG");
    expect(body.error.message).toContain("5 分钟");
    expect(readdirSync(path.join(process.env.UPLOADS_DIR!, accountId))).toEqual([]);
    expect(countDrafts(db)).toBe(0);
  });

  it("恰好 5 分钟：允许上传", async () => {
    setupEnv();
    setDurationProbe(async () => 5 * 60 * 1000);
    setTranscriptionService(new FakeTranscriptionService());
    const res = await post("正好五分钟", mp4File());
    expect(res.status).toBe(201);
  });

  it("坏扩展名（.avi）：415 UNSUPPORTED_FORMAT，不落盘", async () => {
    setupEnv();
    const res = await post("格式不对", mp4File("clip.avi", "video/x-msvideo"));
    expect(res.status).toBe(415);
    expect((await res.json()).error.code).toBe("UNSUPPORTED_FORMAT");
    expect(readdirSync(process.env.UPLOADS_DIR!)).toEqual([]);
  });

  it("扩展名对但 content-type 不对：同样 415（双查）", async () => {
    setupEnv();
    const res = await post("伪装的", mp4File("fake.mp4", "text/plain"));
    expect(res.status).toBe(415);
    expect((await res.json()).error.code).toBe("UNSUPPORTED_FORMAT");
  });

  it("缺标题 / 空标题 400；缺文件 400", async () => {
    setupEnv();
    expect((await post(undefined, mp4File())).status).toBe(400);
    expect((await post("   ", mp4File())).status).toBe(400);
    expect((await post("有标题没文件", undefined)).status).toBe(400);
  });

  it("转写进行中（poll 钉成 pending）：201 但草稿保持 transcribing，任务引用已落库", async () => {
    const db = setupEnv();
    setDurationProbe(async () => 30_000);
    setTranscriptionService(new FakeTranscriptionService({ state: "pending" }));

    const res = await post("还在转", mp4File());
    expect(res.status).toBe(201);
    const { draft } = await res.json();
    expect(draft.status).toBe("transcribing");
    const row = db
      .prepare(
        "SELECT status, transcribe_task_id FROM content_drafts WHERE id = ?"
      )
      .get(draft.id) as { status: string; transcribe_task_id: string };
    expect(row.status).toBe("transcribing");
    expect(row.transcribe_task_id).toBeTruthy();
    expect(countSentences(db, draft.id)).toBe(0);
  });

  it("转写失败（poll 钉成 failed）：草稿留 transcribing 且错误信息落库（可重试）", async () => {
    const db = setupEnv();
    setDurationProbe(async () => 30_000);
    setTranscriptionService(
      new FakeTranscriptionService({ state: "failed", error: "讯飞 10105" })
    );

    const res = await post("转写失败", mp4File());
    expect(res.status).toBe(201);
    const { draft } = await res.json();
    expect(draft.status).toBe("transcribing");
    const row = db
      .prepare(
        "SELECT status, transcribe_error FROM content_drafts WHERE id = ?"
      )
      .get(draft.id) as { status: string; transcribe_error: string | null };
    expect(row.status).toBe("transcribing");
    expect(row.transcribe_error).toBe("讯飞 10105");
  });
});

function countDrafts(db: Db): number {
  return (
    db.prepare("SELECT COUNT(*) AS n FROM content_drafts").get() as {
      n: number;
    }
  ).n;
}

function countSentences(db: Db, draftId: string): number {
  return (
    db
      .prepare("SELECT COUNT(*) AS n FROM draft_sentences WHERE draft_id = ?")
      .get(draftId) as { n: number }
  ).n;
}
