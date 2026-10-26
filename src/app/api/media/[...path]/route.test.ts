import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { GET } from "./route";
import { openDb } from "@/lib/db";
import {
  setupDb,
  sessionCookieFor,
} from "@/lib/testing/auth-test-utils";

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const fn of cleanups) fn();
  cleanups.length = 0;
  delete process.env.DB_PATH;
  delete process.env.UPLOADS_DIR;
  delete process.env.CONTENT_DATA_DIR;
});

function setupEnv(): void {
  setupDb("ra-media");
  const uploadsDir = mkdtempSync(path.join(tmpdir(), "ra-uploads-"));
  process.env.UPLOADS_DIR = uploadsDir;
  cleanups.push(() => rmSync(uploadsDir, { recursive: true, force: true }));
}

function accountIdOf(email: string, isAdmin = false): string {
  sessionCookieFor(email, isAdmin);
  const db = openDb(process.env.DB_PATH!);
  const row = db.prepare("SELECT id FROM accounts WHERE email = ?").get(email) as {
    id: string;
  };
  db.close();
  return row.id;
}

function seedVideo(accountId: string): void {
  const dir = path.join(process.env.UPLOADS_DIR!, accountId);
  mkdirSync(dir, { recursive: true });
  // 足够区分 range 切片的字节
  writeFileSync(
    path.join(dir, "clip.mp4"),
    Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  );
}

function get(path_: string[], email?: string, range?: string): Promise<Response> {
  const headers: Record<string, string> = {};
  if (email) headers.cookie = sessionCookieFor(email);
  if (range) headers.range = range;
  return GET(new Request("http://x/api/media", { headers }), {
    params: Promise.resolve({ path: path_ }),
  });
}

describe("GET /api/media/*", () => {
  it("未登录 401", async () => {
    setupEnv();
    const id = accountIdOf("parent@test.com");
    seedVideo(id);
    const res = await get([id, "clip.mp4"]);
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("UNAUTHORIZED");
  });

  it("归属账号可播：200、mp4 content-type、字节完整", async () => {
    setupEnv();
    const id = accountIdOf("parent@test.com");
    seedVideo(id);
    const res = await get([id, "clip.mp4"], "parent@test.com");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("video/mp4");
    expect(res.headers.get("accept-ranges")).toBe("bytes");
    expect(Buffer.from(await res.arrayBuffer())).toEqual(
      Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    );
  });

  it("他人账号访问被拒 404（不暴露文件是否存在）", async () => {
    setupEnv();
    const id = accountIdOf("parent@test.com");
    seedVideo(id);
    accountIdOf("other@test.com");
    const res = await get([id, "clip.mp4"], "other@test.com");
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("MEDIA_NOT_FOUND");
  });

  it("带 range 头（Safari <video>）回 206 与对应切片", async () => {
    setupEnv();
    const id = accountIdOf("parent@test.com");
    seedVideo(id);
    const res = await get([id, "clip.mp4"], "parent@test.com", "bytes=2-5");
    expect(res.status).toBe(206);
    expect(res.headers.get("content-range")).toBe("bytes 2-5/10");
    expect(res.headers.get("content-length")).toBe("4");
    expect(Buffer.from(await res.arrayBuffer())).toEqual(
      Buffer.from([3, 4, 5, 6])
    );
  });

  it("路径非法（穿越/段数不对）一律 404", async () => {
    setupEnv();
    accountIdOf("parent@test.com");
    for (const segments of [
      ["..", "etc", "passwd"],
      ["only-one-segment"],
      ["a", "b", "c"],
      [".", "x"],
    ]) {
      const res = await get(segments, "parent@test.com");
      expect(res.status).toBe(404);
    }
  });

  it("文件不存在 404", async () => {
    setupEnv();
    const id = accountIdOf("parent@test.com");
    const res = await get([id, "ghost.mp4"], "parent@test.com");
    expect(res.status).toBe(404);
  });
});

describe("GET /api/media/* · 标准内容视频（12 号票）", () => {
  /** 落一个已发布标准内容包（运行时标准目录），视频引用 adminId 目录下的 clip.mp4 */
  function seedStandardPack(adminId: string): void {
    const dataDir = mkdtempSync(path.join(tmpdir(), "ra-stdpack-"));
    process.env.CONTENT_DATA_DIR = dataDir;
    cleanups.push(() => rmSync(dataDir, { recursive: true, force: true }));
    const dir = path.join(dataDir, "standard");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      path.join(dir, "std-1.json"),
      JSON.stringify({
        id: "std-1",
        title: "五上 U2 Story time",
        source: "standard-upload",
        video: `${adminId}/clip.mp4`,
        type: "standard",
        owner: null,
        sentences: [{ text: "hello", start: 0, end: 0.9 }],
      }),
      "utf8"
    );
  }

  it("登录家长可播管理员制作的标准内容视频（登录后才可播，跨账号放行仅限标准包引用的文件）", async () => {
    setupEnv();
    const adminId = accountIdOf("admin@test.com", true);
    seedVideo(adminId);
    seedStandardPack(adminId);

    const res = await get([adminId, "clip.mp4"], "parent@test.com");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("video/mp4");
    expect(Buffer.from(await res.arrayBuffer())).toEqual(
      Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    );
  });

  it("未被任何标准内容引用的他人文件仍然 404（自定义内容不因此泄露）", async () => {
    setupEnv();
    const adminId = accountIdOf("admin@test.com", true);
    seedVideo(adminId); // clip.mp4 存在但没有标准包引用它
    seedStandardPack(adminId);

    const res = await get([adminId, "ghost.mp4"], "parent@test.com");
    expect(res.status).toBe(404);
  });

  it("标准内容引用但文件已缺失：404", async () => {
    setupEnv();
    const adminId = accountIdOf("admin@test.com", true);
    seedStandardPack(adminId); // 引用了 clip.mp4 但没落文件

    const res = await get([adminId, "clip.mp4"], "parent@test.com");
    expect(res.status).toBe(404);
  });

  it("未登录访问标准内容视频：401（标准视频同样走鉴权）", async () => {
    setupEnv();
    const adminId = accountIdOf("admin@test.com", true);
    seedVideo(adminId);
    seedStandardPack(adminId);

    const res = await get([adminId, "clip.mp4"]);
    expect(res.status).toBe(401);
  });
});
