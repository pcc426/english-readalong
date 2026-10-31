import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { POST } from "./route";
import { findAccountByEmail } from "@/lib/auth/accounts";
import {
  setupDb,
  sessionCookieFor,
} from "@/lib/testing/auth-test-utils";
import { setDurationProbe } from "@/lib/drafts/probe";
import { setPosterExtractor } from "@/lib/drafts/poster";
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
  setPosterExtractor(null);
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

  it("合法上传：201 { draft }，状态已是未校对，假转写句子与毫秒时间落库，视频落账号目录", async () => {
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

describe("POST /api/uploads · 封面抽帧（票 01）", () => {
  it("上传成功后立即抽帧：poster 异步落库（转写期间列表已能拿到 posterUrl）", async () => {
    const db = setupEnv();
    const accountId = accountIdOf(db);
    setDurationProbe(async () => 30_000);
    setTranscriptionService(new FakeTranscriptionService());
    setPosterExtractor(async (_video, poster) => {
      writeFileSync(poster, Buffer.from([0xff, 0xd8]));
      return true;
    });

    const res = await post("要封面", mp4File());
    expect(res.status).toBe(201);
    const { draft } = await res.json();

    // fire-and-forget：不阻塞响应，但测试要等它落地
    await vi.waitFor(async () => {
      const row = db
        .prepare("SELECT poster_path FROM content_drafts WHERE id = ?")
        .get(draft.id) as { poster_path: string | null };
      expect(row.poster_path).toMatch(
        new RegExp(`^${accountId}/[0-9a-f-]{36}\\.poster\\.jpg$`)
      );
    });
    const row = db
      .prepare("SELECT poster_path FROM content_drafts WHERE id = ?")
      .get(draft.id) as { poster_path: string };
    expect(existsSync(path.join(process.env.UPLOADS_DIR!, row.poster_path))).toBe(true);
  });

  it("抽帧失败（ffmpeg 缺失等）：上传照常 201，poster_path 留空不报错", async () => {
    const db = setupEnv();
    setDurationProbe(async () => 30_000);
    setTranscriptionService(new FakeTranscriptionService());
    setPosterExtractor(async () => false);

    const res = await post("没封面也行", mp4File());
    expect(res.status).toBe(201);
    const { draft } = await res.json();

    await vi.waitFor(async () => {
      const row = db
        .prepare("SELECT poster_path FROM content_drafts WHERE id = ?")
        .get(draft.id) as { poster_path: string | null };
      // 失败结果也要「发生过了」：等它把 poster_path 定格为 null 再断言
      expect(row.poster_path).toBeNull();
    });
  });

  it("标准草稿同一套：抽帧也触发（管理员上传）", async () => {
    const db = setupEnv();
    sessionCookieFor("admin@test.com", true);
    const adminId = findAccountByEmail(db, "admin@test.com")!.id;
    setDurationProbe(async () => 30_000);
    setTranscriptionService(new FakeTranscriptionService());
    setPosterExtractor(async (_video, poster) => {
      writeFileSync(poster, Buffer.from([0xff, 0xd8]));
      return true;
    });

    const form = new FormData();
    form.set("title", "标准封面");
    form.set("type", "standard");
    form.set("unitId", "五上-U2");
    form.set("moduleKind", "Story time");
    form.set("file", mp4File());
    const res = await POST(
      new Request("http://x/api/uploads", {
        method: "POST",
        headers: { cookie: sessionCookieFor("admin@test.com", true) },
        body: form,
      })
    );
    expect(res.status).toBe(201);
    const { draft } = await res.json();
    await vi.waitFor(async () => {
      const row = db
        .prepare("SELECT poster_path FROM content_drafts WHERE id = ?")
        .get(draft.id) as { poster_path: string | null };
      expect(row.poster_path).toMatch(
        new RegExp(`^${adminId}/[0-9a-f-]{36}\\.poster\\.jpg$`)
      );
    });
  });
});

describe("POST /api/uploads · 标准内容（12 号票）", () => {
  function postWithFields(
    fields: Record<string, string>,
    file: File | undefined,
    email = "admin@test.com"
  ): Promise<Response> {
    const form = new FormData();
    form.set("title", "标准内容制作");
    for (const [k, v] of Object.entries(fields)) form.set(k, v);
    if (file) form.set("file", file);
    return POST(
      new Request("http://x/api/uploads", {
        method: "POST",
        headers: { cookie: sessionCookieFor(email, email === "admin@test.com") },
        body: form,
      })
    );
  }

  /** 管理员账号 id（sessionCookieFor 惰性建号后查询） */
  function adminIdOf(db: Db): string {
    sessionCookieFor("admin@test.com", true);
    const account = findAccountByEmail(db, "admin@test.com");
    if (!account) throw new Error("测试管理员未创建");
    return account.id;
  }

  const stdFields = { type: "standard", unitId: "五上-U2", moduleKind: "Story time" };

  it("非管理员传 type=standard：403 FORBIDDEN，不落盘不建草稿", async () => {
    const db = setupEnv();
    accountIdOf(db);
    const res = await postWithFields(stdFields, mp4File(), "parent@test.com");
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("FORBIDDEN");
    expect(readdirSync(process.env.UPLOADS_DIR!)).toEqual([]);
    expect(countDrafts(db)).toBe(0);
  });

  it("管理员 + 未知单元：400 UNKNOWN_MODULE", async () => {
    setupEnv();
    const res = await postWithFields(
      { ...stdFields, unitId: "五上-U99" },
      mp4File()
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("UNKNOWN_MODULE");
  });

  it("管理员 + 教材里不存在的栏目：400 UNKNOWN_MODULE", async () => {
    setupEnv();
    const res = await postWithFields(
      { ...stdFields, moduleKind: "Nope time" },
      mp4File()
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("UNKNOWN_MODULE");
  });

  it("管理员 + 缺 unit/module 字段：同样 400 UNKNOWN_MODULE", async () => {
    setupEnv();
    const res = await postWithFields({ type: "standard" }, mp4File());
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("UNKNOWN_MODULE");
  });

  it("管理员合法上传：201，草稿 type=standard 且 unit/module 落库，视频落管理员账号目录", async () => {
    const db = setupEnv();
    const adminId = adminIdOf(db);
    setDurationProbe(async () => 30_000);
    setTranscriptionService(new FakeTranscriptionService());

    const res = await postWithFields(stdFields, mp4File());
    expect(res.status).toBe(201);
    const { draft } = await res.json();
    expect(draft.status).toBe("proofreading");
    expect(draft.type).toBe("standard");
    expect(draft.unitId).toBe("五上-U2");
    expect(draft.moduleKind).toBe("Story time");

    const row = db
      .prepare(
        "SELECT account_id, type, unit_id, module_kind, status FROM content_drafts WHERE id = ?"
      )
      .get(draft.id) as {
      account_id: string;
      type: string;
      unit_id: string;
      module_kind: string;
      status: string;
    };
    expect(row.account_id).toBe(adminId);
    expect(row.type).toBe("standard");
    expect(row.unit_id).toBe("五上-U2");
    expect(row.module_kind).toBe("Story time");
    expect(row.status).toBe("proofreading");

    // 视频与其他上传一致落 data/uploads/<accountId>/（管理员目录）
    const videoPath = (
      db.prepare("SELECT video_path FROM content_drafts WHERE id = ?").get(draft.id) as {
        video_path: string;
      }
    ).video_path;
    expect(videoPath).toMatch(new RegExp(`^${adminId}/[0-9a-f-]{36}\\.mp4$`));
    expect(readdirSync(path.join(process.env.UPLOADS_DIR!, adminId))).toEqual([
      path.basename(videoPath),
    ]);
  });

  it("草稿标题由服务端按教材生成＝课文名，客户端传的 title 被忽略（票 02）", async () => {
    const db = setupEnv();
    setDurationProbe(async () => 30_000);
    setTranscriptionService(new FakeTranscriptionService());

    // postWithFields 会带 title="标准内容制作"——服务端必须无视它
    const res = await postWithFields(stdFields, mp4File());
    expect(res.status).toBe(201);
    const { draft } = await res.json();
    expect(draft.title).toBe("The dragon dance");
    const row = db
      .prepare("SELECT title FROM content_drafts WHERE id = ?")
      .get(draft.id) as { title: string };
    expect(row.title).toBe("The dragon dance");
  });

  it("提交不带 title 字段：标准草照常创建，标题仍是课文名（票 02）", async () => {
    setupEnv();
    setDurationProbe(async () => 30_000);
    setTranscriptionService(new FakeTranscriptionService());

    const form = new FormData();
    form.set("type", "standard");
    form.set("unitId", "五上-U2");
    form.set("moduleKind", "Story time");
    form.set("file", mp4File());
    const res = await POST(
      new Request("http://x/api/uploads", {
        method: "POST",
        headers: { cookie: sessionCookieFor("admin@test.com", true) },
        body: form,
      })
    );
    expect(res.status).toBe(201);
    const { draft } = await res.json();
    expect(draft.title).toBe("The dragon dance");
  });

  it("未知 type 值：400 INVALID_TYPE", async () => {
    setupEnv();
    const res = await postWithFields({ type: "premium" }, mp4File());
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("INVALID_TYPE");
  });

  it("管理员不带 type 的普通上传：仍是 custom 草稿（回归）", async () => {
    const db = setupEnv();
    const adminId = adminIdOf(db);
    setDurationProbe(async () => 30_000);
    setTranscriptionService(new FakeTranscriptionService());

    const res = await postWithFields({}, mp4File());
    expect(res.status).toBe(201);
    const { draft } = await res.json();
    const row = db
      .prepare("SELECT account_id, type, unit_id FROM content_drafts WHERE id = ?")
      .get(draft.id) as { account_id: string; type: string; unit_id: string | null };
    expect(row.account_id).toBe(adminId);
    expect(row.type).toBe("custom");
    expect(row.unit_id).toBeNull();
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
