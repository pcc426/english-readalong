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
import { setStandardContentPublic } from "@/lib/settings/content-visibility";

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const fn of cleanups) fn();
  cleanups.length = 0;
  delete process.env.DB_PATH;
  delete process.env.UPLOADS_DIR;
  delete process.env.CONTENT_DATA_DIR;
  delete process.env.CONTENT_DIR;
  delete process.env.SHIPPED_MEDIA_DIR;
});

function setupEnv(standardContentPublic = true): void {
  const db = setupDb("ra-media");
  // v0.3.6：既有用例按「开关开启」跑
  setStandardContentPublic(db, standardContentPublic);
  db.close();
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

  it("关闭态下本人自定义视频不受影响：200", async () => {
    setupEnv(false);
    const id = accountIdOf("parent@test.com");
    seedVideo(id);
    const res = await get([id, "clip.mp4"], "parent@test.com");
    expect(res.status).toBe(200);
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

describe("GET /api/media/* · 封面 jpg（票 01，与视频同规则）", () => {
  function seedPoster(accountId: string, name = "clip.poster.jpg"): void {
    const dir = path.join(process.env.UPLOADS_DIR!, accountId);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, name), Buffer.from([0xff, 0xd8, 0x01]));
  }

  it("归属账号可取自己目录的封面：200、image/jpeg、字节完整", async () => {
    setupEnv();
    const id = accountIdOf("parent@test.com");
    seedPoster(id);
    const res = await get([id, "clip.poster.jpg"], "parent@test.com");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(Buffer.from(await res.arrayBuffer())).toEqual(
      Buffer.from([0xff, 0xd8, 0x01])
    );
  });

  it("他人账号的封面 404（与视频同规则，不暴露存在性）", async () => {
    setupEnv();
    const id = accountIdOf("parent@test.com");
    seedPoster(id);
    accountIdOf("other@test.com");
    const res = await get([id, "clip.poster.jpg"], "other@test.com");
    expect(res.status).toBe(404);
  });

  it("未登录取封面 401", async () => {
    setupEnv();
    const id = accountIdOf("parent@test.com");
    seedPoster(id);
    expect((await get([id, "clip.poster.jpg"])).status).toBe(401);
  });

  it("被公开标准包 poster 字段引用的上传封面：任意登录账号可取", async () => {
    setupEnv();
    const adminId = accountIdOf("admin@test.com", true);
    seedPoster(adminId);
    const dataDir = mkdtempSync(path.join(tmpdir(), "ra-stdposter-"));
    process.env.CONTENT_DATA_DIR = dataDir;
    cleanups.push(() => rmSync(dataDir, { recursive: true, force: true }));
    mkdirSync(path.join(dataDir, "standard"), { recursive: true });
    writeFileSync(
      path.join(dataDir, "standard", "std-1.json"),
      JSON.stringify({
        id: "std-1",
        title: "标准",
        source: "standard-upload",
        video: `${adminId}/clip.mp4`,
        poster: `${adminId}/clip.poster.jpg`,
        type: "standard",
        owner: null,
        sentences: [{ text: "hello", start: 0, end: 0.9 }],
      }),
      "utf8"
    );

    const res = await get([adminId, "clip.poster.jpg"], "parent@test.com");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
  });

  it("标准包只引用了视频、没引用封面时：他人取封面仍 404", async () => {
    setupEnv();
    const adminId = accountIdOf("admin@test.com", true);
    seedPoster(adminId);
    const dataDir = mkdtempSync(path.join(tmpdir(), "ra-stdposter2-"));
    process.env.CONTENT_DATA_DIR = dataDir;
    cleanups.push(() => rmSync(dataDir, { recursive: true, force: true }));
    mkdirSync(path.join(dataDir, "standard"), { recursive: true });
    writeFileSync(
      path.join(dataDir, "standard", "std-1.json"),
      JSON.stringify({
        id: "std-1",
        title: "标准",
        source: "standard-upload",
        video: `${adminId}/clip.mp4`,
        type: "standard",
        owner: null,
        sentences: [{ text: "hello", start: 0, end: 0.9 }],
      }),
      "utf8"
    );

    const res = await get([adminId, "clip.poster.jpg"], "parent@test.com");
    expect(res.status).toBe(404);
  });
});

describe("GET /api/media/shipped/* · 随代码封面（票 01）", () => {
  /** 随代码标准包带 poster 裸文件名（与 video 同形）+ content/media/posters/ 下同名 jpg */
  function seedShippedWithPoster(name = "五上_U2.jpg"): void {
    const contentDir = mkdtempSync(path.join(tmpdir(), "ra-shipped-pack-"));
    const mediaDir = mkdtempSync(path.join(tmpdir(), "ra-shipped-media-"));
    process.env.CONTENT_DIR = contentDir;
    process.env.SHIPPED_MEDIA_DIR = mediaDir;
    cleanups.push(() => rmSync(contentDir, { recursive: true, force: true }));
    cleanups.push(() => rmSync(mediaDir, { recursive: true, force: true }));
    writeFileSync(
      path.join(contentDir, "u2.json"),
      JSON.stringify({
        id: "u2-shipped",
        title: "The dragon dance",
        source: "沪教版五上 Unit 2 · Story time",
        video: "五上_U2.mp4",
        poster: name,
        sentences: [{ text: "hello", start: 0, end: 0.9 }],
      }),
      "utf8"
    );
    mkdirSync(path.join(mediaDir, "posters"));
    writeFileSync(path.join(mediaDir, "posters", name), Buffer.from([0xff, 0xd8, 0x02]));
    writeFileSync(path.join(mediaDir, "五上_U2.mp4"), Buffer.from([1, 2, 3]));
  }

  it("登录账号可取被标准包 poster 引用的随代码封面：200、image/jpeg", async () => {
    setupEnv();
    accountIdOf("parent@test.com");
    seedShippedWithPoster();

    const res = await get(["shipped", "五上_U2.jpg"], "parent@test.com");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(Buffer.from(await res.arrayBuffer())).toEqual(Buffer.from([0xff, 0xd8, 0x02]));
  });

  it("posters/ 下存在但未被引用的封面 404", async () => {
    setupEnv();
    accountIdOf("parent@test.com");
    seedShippedWithPoster();
    writeFileSync(
      path.join(process.env.SHIPPED_MEDIA_DIR!, "posters", "secret.jpg"),
      Buffer.from([9])
    );

    const res = await get(["shipped", "secret.jpg"], "parent@test.com");
    expect(res.status).toBe(404);
  });

  it("未登录取随代码封面 401", async () => {
    setupEnv();
    accountIdOf("parent@test.com");
    seedShippedWithPoster();
    expect((await get(["shipped", "五上_U2.jpg"])).status).toBe(401);
  });

  it("根目录同名 jpg（不在 posters/）即便被引用也 404：封面只认 posters/ 子目录", async () => {
    setupEnv();
    accountIdOf("parent@test.com");
    seedShippedWithPoster();

    const res = await get(["shipped", "nope.jpg"], "parent@test.com");
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

  it("关闭态下非管理员不可播标准视频，管理员可以", async () => {
    setupEnv(false);
    const adminId = accountIdOf("admin@test.com", true);
    seedVideo(adminId);
    seedStandardPack(adminId);

    const blocked = await get([adminId, "clip.mp4"], "parent@test.com");
    expect(blocked.status).toBe(404);

    const adminRes = await get([adminId, "clip.mp4"], "admin@test.com");
    expect(adminRes.status).toBe(200);
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

describe("GET /api/media/shipped/* · 随代码标准内容视频（统一鉴权）", () => {
  /** 落一个随代码风格的标准包（video 是文件名）+ 对应的 content/media 文件 */
  function seedShipped(name = "五上_U2.mp4"): void {
    const contentDir = mkdtempSync(path.join(tmpdir(), "ra-shipped-pack-"));
    const mediaDir = mkdtempSync(path.join(tmpdir(), "ra-shipped-media-"));
    process.env.CONTENT_DIR = contentDir;
    process.env.SHIPPED_MEDIA_DIR = mediaDir;
    cleanups.push(() => rmSync(contentDir, { recursive: true, force: true }));
    cleanups.push(() => rmSync(mediaDir, { recursive: true, force: true }));
    writeFileSync(
      path.join(contentDir, "u2.json"),
      JSON.stringify({
        id: "u2-shipped",
        title: "The dragon dance",
        source: "沪教版五上 Unit 2 · Story time",
        video: name,
        sentences: [{ text: "hello", start: 0, end: 0.9 }],
      }),
      "utf8"
    );
    writeFileSync(
      path.join(mediaDir, name),
      Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    );
  }

  it("登录账号可播随代码标准视频：200、mp4、字节完整", async () => {
    setupEnv();
    accountIdOf("parent@test.com");
    const name = "五上_U2.mp4";
    seedShipped(name);

    const res = await get(["shipped", name], "parent@test.com");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("video/mp4");
    expect(Buffer.from(await res.arrayBuffer())).toEqual(
      Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    );
  });

  it("关闭态下非管理员不可播随代码标准视频，管理员可以", async () => {
    setupEnv(false);
    accountIdOf("parent@test.com");
    accountIdOf("admin@test.com", true);
    const name = "五上_U2.mp4";
    seedShipped(name);

    const blocked = await get(["shipped", name], "parent@test.com");
    expect(blocked.status).toBe(404);

    const adminRes = await get(["shipped", name], "admin@test.com");
    expect(adminRes.status).toBe(200);
  });

  it("未登录 401（不再有静态公开路径）", async () => {
    setupEnv();
    accountIdOf("parent@test.com");
    const name = "五上_U2.mp4";
    seedShipped(name);

    const res = await get(["shipped", name]);
    expect(res.status).toBe(401);
  });

  it("Range 请求回 206 切片（iPad Safari）", async () => {
    setupEnv();
    accountIdOf("parent@test.com");
    const name = "五上_U2.mp4";
    seedShipped(name);

    const res = await get(["shipped", name], "parent@test.com", "bytes=0-3");
    expect(res.status).toBe(206);
    expect(res.headers.get("content-range")).toBe("bytes 0-3/10");
    expect(Buffer.from(await res.arrayBuffer())).toEqual(
      Buffer.from([1, 2, 3, 4])
    );
  });

  it("目录里有但未被标准包引用的文件：404", async () => {
    setupEnv();
    accountIdOf("parent@test.com");
    seedShipped("五上_U2.mp4");
    writeFileSync(
      path.join(process.env.SHIPPED_MEDIA_DIR!, "secret.mp4"),
      Buffer.from([9, 9])
    );

    const res = await get(["shipped", "secret.mp4"], "parent@test.com");
    expect(res.status).toBe(404);
  });

  it("路径穿越或段数不对一律 404", async () => {
    setupEnv();
    accountIdOf("parent@test.com");
    seedShipped();

    for (const segments of [
      ["shipped", "..", "五上_U2.mp4"],
      ["shipped", "../五上_U2.mp4"],
      ["shipped"],
    ]) {
      const res = await get(segments, "parent@test.com");
      expect(res.status).toBe(404);
    }
  });
});
