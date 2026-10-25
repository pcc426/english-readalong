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
});

function setupEnv(): void {
  setupDb("ra-media");
  const uploadsDir = mkdtempSync(path.join(tmpdir(), "ra-uploads-"));
  process.env.UPLOADS_DIR = uploadsDir;
  cleanups.push(() => rmSync(uploadsDir, { recursive: true, force: true }));
}

function accountIdOf(email: string): string {
  sessionCookieFor(email);
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
