import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  createPosterExtractor,
  generateDraftPoster,
  getPosterExtractor,
  posterRelPathFor,
  setPosterExtractor,
  shippedPosterNameFor,
  type FfmpegRunner,
} from "./poster";
import { setupDb } from "@/lib/testing/auth-test-utils";
import { createAccount } from "@/lib/auth/accounts";
import { createDraft, getDraft, setDraftVideo } from "./repo";

const cleanups: string[] = [];
afterEach(() => {
  for (const dir of cleanups) rmSync(dir, { recursive: true, force: true });
  cleanups.length = 0;
  setPosterExtractor(null);
  delete process.env.UPLOADS_DIR;
});

function tempDir(prefix: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  cleanups.push(dir);
  return dir;
}

/** 写了输出文件的假 ffmpeg（模拟抽帧成功） */
const runWrites: FfmpegRunner = async (_bin, args) => {
  writeFileSync(args[args.length - 1], Buffer.from([0xff, 0xd8]));
};

function argsOf(run: FfmpegRunner, calls: string[][]): FfmpegRunner {
  return async (bin, args) => {
    calls.push(args);
    return run(bin, args);
  };
}

describe("createPosterExtractor", () => {
  it("成功：ffmpeg 参数按票面约定（-ss 1.0 优先、单帧、360 宽、q:v 4），产物落指定路径", async () => {
    const dir = tempDir("ra-poster-");
    const video = path.join(dir, "v.mp4");
    const poster = path.join(dir, "p.jpg");
    const calls: string[][] = [];
    const extract = createPosterExtractor(argsOf(runWrites, calls));

    expect(await extract(video, poster)).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual([
      "-y",
      "-ss",
      "1.0",
      "-i",
      video,
      "-frames:v",
      "1",
      "-vf",
      "scale=360:-2",
      "-q:v",
      "4",
      poster,
    ]);
    expect(existsSync(poster)).toBe(true);
  });

  it("1.0s 抽帧失败（视频不足 1s，run 抛错）：回退 0.2s 重试成功", async () => {
    const dir = tempDir("ra-poster-");
    const video = path.join(dir, "v.mp4");
    const poster = path.join(dir, "p.jpg");
    const calls: string[][] = [];
    const run: FfmpegRunner = async (_bin, args) => {
      calls.push(args);
      if (args[2] === "1.0") throw new Error("Output file is empty");
      writeFileSync(args[args.length - 1], Buffer.from([0xff]));
    };
    const extract = createPosterExtractor(run);

    expect(await extract(video, poster)).toBe(true);
    expect(calls.map((a) => a[2])).toEqual(["1.0", "0.2"]);
    expect(existsSync(poster)).toBe(true);
  });

  it("run 成功但没写出文件（0 字节/缺失）：同样视为失败回退 0.2s", async () => {
    const dir = tempDir("ra-poster-");
    const poster = path.join(dir, "p.jpg");
    const calls: string[][] = [];
    const run: FfmpegRunner = async (_bin, args) => {
      calls.push(args);
      if (args[2] === "0.2") writeFileSync(args[args.length - 1], Buffer.from([0xff]));
      // 1.0s 那次「成功」返回但没写文件
    };
    expect(await createPosterExtractor(run)(path.join(dir, "v.mp4"), poster)).toBe(true);
    expect(calls.map((a) => a[2])).toEqual(["1.0", "0.2"]);
  });

  it("两个时点都失败：返回 false，不残留半成品文件", async () => {
    const dir = tempDir("ra-poster-");
    const video = path.join(dir, "v.mp4");
    const poster = path.join(dir, "p.jpg");
    // 第一次尝试留下垃圾字节（ffmpeg 崩在中途的形态），重试仍失败
    const run: FfmpegRunner = async (_bin, args) => {
      if (args[2] === "1.0") writeFileSync(args[args.length - 1], Buffer.from([0x00]));
      throw new Error("codec error");
    };
    expect(await createPosterExtractor(run)(video, poster)).toBe(false);
    expect(existsSync(poster)).toBe(false);
  });

  it("ffmpeg 可执行文件缺失（ENOENT）：直接 false 不重试（fail-open 与 probe 同策略）", async () => {
    const dir = tempDir("ra-poster-");
    const run: FfmpegRunner = async () => {
      const err = new Error("spawn ffmpeg ENOENT") as NodeJS.ErrnoException;
      err.code = "ENOENT";
      throw err;
    };
    const extract = createPosterExtractor(run);
    expect(await extract(path.join(dir, "v.mp4"), path.join(dir, "p.jpg"))).toBe(false);
  });

  it("默认实现返回可调用函数（真实 ffmpeg 包装，是否装了 ffmpeg 属环境差异）", () => {
    expect(typeof getPosterExtractor()).toBe("function");
  });

  it("注入优先于默认实现，传 null 恢复默认", async () => {
    const stub = async () => true;
    setPosterExtractor(stub);
    expect(await getPosterExtractor()("a.mp4", "b.jpg")).toBe(true);
    setPosterExtractor(null);
    expect(getPosterExtractor()).not.toBe(stub);
  });
});

describe("封面命名派生", () => {
  it("上传视频 → 同目录 <同名>.poster.jpg（与视频不同名，复用账号目录）", () => {
    expect(posterRelPathFor("12ff/abc.mp4")).toBe("12ff/abc.poster.jpg");
  });

  it("无扩展名的引用也安全（追加而非替换）", () => {
    expect(posterRelPathFor("12ff/abc")).toBe("12ff/abc.poster.jpg");
  });

  it("随代码视频文件名 → posters/ 下同名 .jpg（包字段仍为裸文件名，与 video 同形）", () => {
    expect(shippedPosterNameFor("五上_U2.mp4")).toBe("五上_U2.jpg");
    expect(shippedPosterNameFor("五上_U3.mov")).toBe("五上_U3.jpg");
  });
});

describe("generateDraftPoster（上传后抽帧触发点）", () => {
  function setupUploadEnv(): { db: ReturnType<typeof setupDb>; accountId: string } {
    const db = setupDb("ra-poster-gen");
    const uploadsDir = mkdtempSync(path.join(tmpdir(), "ra-poster-up-"));
    process.env.UPLOADS_DIR = uploadsDir;
    cleanups.push(uploadsDir);
    const accountId = createAccount(db, {
      email: "poster-owner@test.com",
      password: "secret123",
    }).id;
    mkdirSync(path.join(uploadsDir, accountId), { recursive: true });
    return { db, accountId };
  }

  function seedDraft(db: ReturnType<typeof setupDb>, accountId: string): string {
    const draft = createDraft(db, { accountId, title: "家里的英语" });
    setDraftVideo(db, draft.id, `${accountId}/clip.mp4`);
    return draft.id;
  }

  it("抽帧成功：poster_path 落 <accountId>/<同名>.poster.jpg，返回 true", async () => {
    const { db, accountId } = setupUploadEnv();
    const draftId = seedDraft(db, accountId);
    let receivedVideo = "";
    let receivedPoster = "";
    setPosterExtractor(async (video, poster) => {
      receivedVideo = video;
      receivedPoster = poster;
      writeFileSync(poster, Buffer.from([0xff, 0xd8]));
      return true;
    });

    expect(await generateDraftPoster(draftId)).toBe(true);
    const draft = getDraft(db, draftId)!;
    expect(draft.posterPath).toBe(`${accountId}/clip.poster.jpg`);
    expect(receivedVideo).toBe(path.join(process.env.UPLOADS_DIR!, accountId, "clip.mp4"));
    expect(receivedPoster).toBe(
      path.join(process.env.UPLOADS_DIR!, accountId, "clip.poster.jpg")
    );
  });

  it("抽帧失败（ffmpeg 缺失等）：poster_path 保持 null，返回 true→false，不抛错", async () => {
    const { db, accountId } = setupUploadEnv();
    const draftId = seedDraft(db, accountId);
    setPosterExtractor(async () => false);

    expect(await generateDraftPoster(draftId)).toBe(false);
    expect(getDraft(db, draftId)!.posterPath).toBeNull();
  });

  it("草稿不存在：false 不抛", async () => {
    setupUploadEnv();
    setPosterExtractor(async () => true);
    expect(await generateDraftPoster("no-such-draft")).toBe(false);
  });
});
