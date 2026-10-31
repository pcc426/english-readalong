import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { openDb } from "@/lib/db";
import { setupDb } from "@/lib/testing/auth-test-utils";
import { createAccount } from "@/lib/auth/accounts";
import { createDraft, setDraftVideo, getDraft } from "./repo";
import {
  backfillShippedPosters,
  backfillUploadPosters,
  isPosterFresh,
} from "./poster-backfill";
import type { PosterExtractor } from "./poster";

const cleanups: string[] = [];
afterEach(() => {
  for (const dir of cleanups) rmSync(dir, { recursive: true, force: true });
  cleanups.length = 0;
  delete process.env.SHIPPED_MEDIA_DIR;
  delete process.env.UPLOADS_DIR;
});

function tempDir(prefix: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  cleanups.push(dir);
  return dir;
}

/** 假抽取器：在产物路径写两个字节，模拟抽帧成功 */
const extractWrites: PosterExtractor = async (_video, poster) => {
  writeFileSync(poster, Buffer.from([0xff, 0xd8]));
  return true;
};

describe("isPosterFresh（幂等判定）", () => {
  it("封面比视频新：跳过", () => {
    expect(isPosterFresh(1000, 2000)).toBe(true);
  });

  it("封面不存在的（null）或与视频同刻或不比视频新：不跳过", () => {
    expect(isPosterFresh(1000, null)).toBe(false);
    expect(isPosterFresh(2000, 2000)).toBe(false);
    expect(isPosterFresh(3000, 2000)).toBe(false);
  });
});

describe("backfillShippedPosters", () => {
  function setupShipped(files: string[]): string {
    const mediaDir = tempDir("ra-bf-media-");
    for (const f of files) {
      writeFileSync(path.join(mediaDir, f), Buffer.from([1, 2, 3]));
    }
    process.env.SHIPPED_MEDIA_DIR = mediaDir;
    return mediaDir;
  }

  it("对全部 shipped 视频生成封面到 posters/ 子目录，映射按包字段形态输出", async () => {
    setupShipped(["五上_U2.mp4", "五上_U3.mp4"]);
    const results = await backfillShippedPosters({ extract: extractWrites });
    expect(results).toEqual([
      { video: "五上_U2.mp4", poster: "五上_U2.jpg", status: "created" },
      { video: "五上_U3.mp4", poster: "五上_U3.jpg", status: "created" },
    ]);
    const postersDir = path.join(process.env.SHIPPED_MEDIA_DIR!, "posters");
    expect(readdirSync(postersDir).sort()).toEqual(["五上_U2.jpg", "五上_U3.jpg"]);
  });

  it("幂等：封面已存在且比视频新则跳过，不重跑 ffmpeg", async () => {
    const mediaDir = setupShipped(["五上_U2.mp4"]);
    const postersDir = path.join(mediaDir, "posters");
    mkdirSync(postersDir);
    writeFileSync(path.join(postersDir, "五上_U2.jpg"), Buffer.from([0xff]));
    // 封面 mtime 推到未来
    const future = new Date(Date.now() + 60_000);
    utimesSync(path.join(postersDir, "五上_U2.jpg"), future, future);

    let calls = 0;
    const results = await backfillShippedPosters({
      extract: async () => {
        calls += 1;
        return true;
      },
    });
    expect(results).toEqual([
      { video: "五上_U2.mp4", poster: "五上_U2.jpg", status: "skipped" },
    ]);
    expect(calls).toBe(0);
  });

  it("封面比视频旧（视频换过）：重新生成而不是跳过", async () => {
    const mediaDir = setupShipped(["五上_U2.mp4"]);
    const postersDir = path.join(mediaDir, "posters");
    mkdirSync(postersDir);
    const posterPath = path.join(postersDir, "五上_U2.jpg");
    writeFileSync(posterPath, Buffer.from([0x00]));
    const past = new Date(Date.now() - 60_000);
    utimesSync(posterPath, past, past);

    const results = await backfillShippedPosters({ extract: extractWrites });
    expect(results[0].status).toBe("created");
    expect(existsSync(posterPath)).toBe(true);
  });

  it("抽帧失败（ffmpeg 缺失）：该条 failed 但整体不炸，其余视频照常", async () => {
    setupShipped(["五上_U2.mp4", "五上_U3.mp4"]);
    const results = await backfillShippedPosters({
      extract: async (_video, poster) =>
        poster.endsWith("五上_U2.jpg") ? false : (writeFileSync(poster, Buffer.from([1])), true),
    });
    expect(results.map((r) => r.status)).toEqual(["failed", "created"]);
    expect(existsSync(path.join(process.env.SHIPPED_MEDIA_DIR!, "posters", "五上_U2.jpg"))).toBe(false);
  });
});

describe("backfillUploadPosters", () => {
  function setupUploads(): string {
    const uploadsDir = tempDir("ra-bf-uploads-");
    process.env.UPLOADS_DIR = uploadsDir;
    return uploadsDir;
  }

  function seedDraftRow(videoPath: string, posterPath: string | null = null): { db: ReturnType<typeof openDb>; draftId: string } {
    const db = setupDb("ra-bf");
    const accountId = createAccount(db, {
      email: `${Math.random().toString(36).slice(2)}@test.com`,
      password: "secret123",
    }).id;
    const draft = createDraft(db, { accountId, title: "x" });
    setDraftVideo(db, draft.id, videoPath);
    if (posterPath) {
      db.prepare("UPDATE content_drafts SET poster_path = ? WHERE id = ?").run(posterPath, draft.id);
    }
    return { db, draftId: draft.id };
  }

  it("遍历账号目录下全部上传视频补抽，映射为 <accountId>/<file> 相对引用，并回填草稿行的 poster_path", async () => {
    const uploadsDir = setupUploads();
    const accA = "acc-aaaa";
    mkdirSync(path.join(uploadsDir, accA), { recursive: true });
    writeFileSync(path.join(uploadsDir, accA, "v1.mp4"), Buffer.from([1]));
    writeFileSync(path.join(uploadsDir, accA, "v2.mp4"), Buffer.from([1]));
    const { db, draftId } = seedDraftRow(`${accA}/v1.mp4`);

    const results = await backfillUploadPosters({ extract: extractWrites, db });
    expect(results).toEqual([
      { video: `${accA}/v1.mp4`, poster: `${accA}/v1.poster.jpg`, status: "created" },
      { video: `${accA}/v2.mp4`, poster: `${accA}/v2.poster.jpg`, status: "created" },
    ]);
    expect(getDraft(db, draftId)!.posterPath).toBe(`${accA}/v1.poster.jpg`);
    db.close();
  });

  it("幂等：封面新于视频则 skipped；草稿行已有 poster_path 不覆盖", async () => {
    const uploadsDir = setupUploads();
    const acc = "acc-bbbb";
    mkdirSync(path.join(uploadsDir, acc), { recursive: true });
    writeFileSync(path.join(uploadsDir, acc, "v1.mp4"), Buffer.from([1]));
    const posterPath = path.join(uploadsDir, acc, "v1.poster.jpg");
    writeFileSync(posterPath, Buffer.from([0xff]));
    const future = new Date(Date.now() + 60_000);
    utimesSync(posterPath, future, future);
    const { db, draftId } = seedDraftRow(`${acc}/v1.mp4`, `${acc}/old.poster.jpg`);

    let calls = 0;
    const results = await backfillUploadPosters({
      extract: async () => {
        calls += 1;
        return true;
      },
      db,
    });
    expect(results).toEqual([
      { video: `${acc}/v1.mp4`, poster: `${acc}/v1.poster.jpg`, status: "skipped" },
    ]);
    expect(calls).toBe(0);
    expect(getDraft(db, draftId)!.posterPath).toBe(`${acc}/old.poster.jpg`);
    db.close();
  });

  it("uploads 根直下的散文件不是视频引用形态（缺账号段），不处理", async () => {
    const uploadsDir = setupUploads();
    writeFileSync(path.join(uploadsDir, "stray.mp4"), Buffer.from([1]));

    const results = await backfillUploadPosters({ extract: extractWrites });
    expect(results).toEqual([]);
  });

  it("上传目录不存在（fresh 部署常态）：返回空不抛", async () => {
    setupUploads();
    const results = await backfillUploadPosters({ extract: extractWrites });
    expect(results).toEqual([]);
  });
});
