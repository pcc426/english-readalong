import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { GET } from "./route";
import { openDb, type Db } from "@/lib/db";
import {
  setupDb,
  sessionCookieFor,
} from "@/lib/testing/auth-test-utils";
import { createDraft, setDraftVideo, completeTranscription } from "@/lib/drafts/repo";
import { createStandardDraft } from "@/lib/drafts/standard-drafts";

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const fn of cleanups) fn();
  cleanups.length = 0;
  delete process.env.DB_PATH;
  delete process.env.UPLOADS_DIR;
});

function setupEnv(): Db {
  const db = setupDb("ra-list");
  const uploadsDir = mkdtempSync(path.join(tmpdir(), "ra-uploads-"));
  process.env.UPLOADS_DIR = uploadsDir;
  cleanups.push(() => rmSync(uploadsDir, { recursive: true, force: true }));
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

function seedDraft(
  db: Db,
  accountId: string,
  title: string,
  sentenceCount = 0
): string {
  const draft = createDraft(db, { accountId, title });
  setDraftVideo(db, draft.id, `${accountId}/${draft.id}.mp4`);
  if (sentenceCount > 0) {
    completeTranscription(
      db,
      draft.id,
      Array.from({ length: sentenceCount }, (_, i) => ({
        text: `句子 ${i}`,
        startMs: i * 1000,
        endMs: i * 1000 + 800,
      }))
    );
  }
  return draft.id;
}

function get(cookie: string): Promise<Response> {
  return GET(new Request("http://x/api/drafts", { headers: { cookie } }));
}

describe("GET /api/drafts", () => {
  it("未登录 401", async () => {
    setupEnv();
    const res = await get("");
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("UNAUTHORIZED");
  });

  it("只列本人草稿，含状态与句子数", async () => {
    const db = setupEnv();
    const mine = accountIdOf("parent@test.com");
    const other = accountIdOf("other@test.com");
    // seedDraft 经 completeTranscription 落句 → 状态为未校对
    seedDraft(db, mine, "我的草稿", 4);
    seedDraft(db, other, "别人家的草稿", 9);

    const res = await get(sessionCookieFor("parent@test.com"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.drafts).toHaveLength(1);
    expect(body.drafts[0]).toMatchObject({
      title: "我的草稿",
      status: "proofreading",
      sentenceCount: 4,
    });
    expect(typeof body.drafts[0].id).toBe("string");
    expect(typeof body.drafts[0].createdAt).toBe("string");

    // 另一账号视角只看到自己的
    const res2 = await get(sessionCookieFor("other@test.com"));
    const body2 = await res2.json();
    expect(body2.drafts).toHaveLength(1);
    expect(body2.drafts[0].title).toBe("别人家的草稿");
    expect(body2.drafts[0].sentenceCount).toBe(9);
  });

  it("新草稿排在前（转写完成后句子数可见）", async () => {
    const db = setupEnv();
    const mine = accountIdOf("parent@test.com");
    const first = seedDraft(db, mine, "第一个", 0);
    completeTranscription(db, first, [
      { text: "a", startMs: 0, endMs: 900 },
      { text: "b", startMs: 1000, endMs: 1800 },
    ]);
    seedDraft(db, mine, "第二个", 0);

    const res = await get(sessionCookieFor("parent@test.com"));
    const body = await res.json();
    expect(body.drafts.map((d: { title: string }) => d.title)).toEqual([
      "第二个",
      "第一个",
    ]);
    expect(body.drafts[1].status).toBe("proofreading");
    expect(body.drafts[1].sentenceCount).toBe(2);
  });

  it("列表带 type 与教材引用字段：standard 草稿带 unit/module，custom 草稿为 null（12 号票）", async () => {
    const db = setupEnv();
    const mine = accountIdOf("parent@test.com");
    const std = createStandardDraft(db, {
      accountId: mine,
      title: "五上 U2 Story time",
      unitId: "五上-U2",
      moduleKind: "Story time",
    });
    seedDraft(db, mine, "自定义草稿", 0);

    const res = await get(sessionCookieFor("parent@test.com"));
    const body = await res.json();
    const stdItem = body.drafts.find((d: { id: string }) => d.id === std.id);
    const customItem = body.drafts.find(
      (d: { title: string }) => d.title === "自定义草稿"
    );
    expect(stdItem).toMatchObject({
      type: "standard",
      unitId: "五上-U2",
      moduleKind: "Story time",
    });
    expect(customItem).toMatchObject({
      type: "custom",
      unitId: null,
      moduleKind: null,
    });
  });

  it("普通账号的列表仍只含本人草稿：管理员的标准草稿不出现在家长列表里（12 号票）", async () => {
    const db = setupEnv();
    const adminId = accountIdOf("admin@test.com", true);
    createStandardDraft(db, {
      accountId: adminId,
      title: "管理员的标准草稿",
      unitId: "五上-U1",
      moduleKind: "Talking time",
    });
    accountIdOf("parent@test.com");

    const res = await get(sessionCookieFor("parent@test.com"));
    const body = await res.json();
    expect(body.drafts).toHaveLength(0);
  });

  describe("?type= 过滤（V0.2 整改）", () => {
    /** 同一账号既有标准草稿又有自定义草稿（管理员两页共用的情形） */
    function seedBoth(db: Db, accountId: string) {
      const std = createStandardDraft(db, {
        accountId,
        title: "标准草稿",
        unitId: "五上-U2",
        moduleKind: "Story time",
      });
      const customId = seedDraft(db, accountId, "自定义草稿", 2);
      return { stdId: std.id, customId };
    }

    function getWith(cookie: string, query: string): Promise<Response> {
      return GET(new Request(`http://x/api/drafts${query}`, { headers: { cookie } }));
    }

    it("type=custom 只返回自定义草稿：管理员的标准草稿不混进自定义页", async () => {
      const db = setupEnv();
      const mine = accountIdOf("admin@test.com", true);
      const { customId } = seedBoth(db, mine);

      const res = await getWith(
        sessionCookieFor("admin@test.com", true),
        "?type=custom"
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.drafts).toHaveLength(1);
      expect(body.drafts[0]).toMatchObject({ id: customId, type: "custom" });
    });

    it("type=standard 只返回标准草稿", async () => {
      const db = setupEnv();
      const mine = accountIdOf("admin@test.com", true);
      const { stdId } = seedBoth(db, mine);

      const res = await getWith(
        sessionCookieFor("admin@test.com", true),
        "?type=standard"
      );
      const body = await res.json();
      expect(body.drafts).toHaveLength(1);
      expect(body.drafts[0]).toMatchObject({ id: stdId, type: "standard" });
    });

    it("不带 type 或值不认识时不过滤（返回全部）", async () => {
      const db = setupEnv();
      const mine = accountIdOf("admin@test.com", true);
      seedBoth(db, mine);
      const cookie = sessionCookieFor("admin@test.com", true);

      const all = await getWith(cookie, "");
      expect((await all.json()).drafts).toHaveLength(2);

      const bogus = await getWith(cookie, "?type=bogus");
      expect((await bogus.json()).drafts).toHaveLength(2);
    });

    it("过滤仍按账号隔离：type=custom 只看本人的", async () => {
      const db = setupEnv();
      const otherId = accountIdOf("other@test.com");
      seedDraft(db, otherId, "别人的", 1);
      const mine = accountIdOf("admin@test.com", true);
      const { customId } = seedBoth(db, mine);

      const res = await getWith(
        sessionCookieFor("admin@test.com", true),
        "?type=custom"
      );
      const body = await res.json();
      expect(body.drafts).toHaveLength(1);
      expect(body.drafts[0].id).toBe(customId);
    });
  });
});
