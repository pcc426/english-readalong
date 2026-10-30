import { afterEach, describe, expect, it } from "vitest";
import { GET } from "./route";
import { setupDb, sessionCookieFor } from "@/lib/testing/auth-test-utils";
import { registeredBooks } from "@/lib/textbook/textbook";

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const fn of cleanups) fn();
  cleanups.length = 0;
  delete process.env.DB_PATH;
});

function setupEnv() {
  const db = setupDb("ra-tb-module");
  // 外键要求登录账号真实存在（sessionCookieFor 惰性建号即可）
  void db;
}

function get(query: string, cookie?: string): Promise<Response> {
  return GET(
    new Request(`http://x/api/textbook/module${query}`, {
      headers: cookie ? { cookie } : {},
    })
  );
}

describe("GET /api/textbook/module（12 号票教材原文预填）", () => {
  it("未登录 401", async () => {
    setupEnv();
    const res = await get("?unitId=五上-U2&moduleKind=Story%20time");
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("UNAUTHORIZED");
  });

  it("登录即可读：返回该模块的教材原句清单（ASR 只作对照）", async () => {
    setupEnv();
    // 数据源从注册表取（票 02 改装载方式）；断言行为与原来一致
    const unit = registeredBooks.find((b) => b.book.id === "grade5a")!.data.units[0];
    const mod = unit.modules[0];
    const res = await get(
      `?unitId=${encodeURIComponent(unit.unitId)}&moduleKind=${encodeURIComponent(mod.moduleKind)}`,
      sessionCookieFor("parent@test.com")
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      unitId: unit.unitId,
      moduleKind: mod.moduleKind,
      sentences: mod.sentences,
    });
  });

  it("缺参数 400 INVALID_PARAMS", async () => {
    setupEnv();
    const cookie = sessionCookieFor("parent@test.com");
    expect((await get("", cookie)).status).toBe(400);
    const res = await get("?unitId=五上-U2", cookie);
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("INVALID_PARAMS");
  });

  it("未知单元 / 教材里不存在的栏目：404 UNKNOWN_MODULE", async () => {
    setupEnv();
    const cookie = sessionCookieFor("parent@test.com");
    const res = await get(
      `?unitId=${encodeURIComponent("五上-U99")}&moduleKind=Story%20time`,
      cookie
    );
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("UNKNOWN_MODULE");

    const res2 = await get(
      `?unitId=五上-U2&moduleKind=${encodeURIComponent("Nope time")}`,
      cookie
    );
    expect(res2.status).toBe(404);
    expect((await res2.json()).error.code).toBe("UNKNOWN_MODULE");
  });
});
