import { describe, expect, it } from "vitest";
import { GET, PUT } from "./route";
import { setupDb, sessionCookieFor } from "@/lib/testing/auth-test-utils";

function get(cookie?: string) {
  const headers = new Headers();
  if (cookie) headers.set("cookie", cookie);
  return GET(new Request("http://x/api/admin/content-visibility", { headers }));
}

function put(cookie: string, body: unknown) {
  return PUT(
    new Request("http://x/api/admin/content-visibility", {
      method: "PUT",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

describe("GET/PUT /api/admin/content-visibility（v0.3.6）", () => {
  it("未登录 401", async () => {
    setupDb("ra-visibility-admin");
    expect((await get()).status).toBe(401);
  });

  it("非管理员读写都 403", async () => {
    setupDb("ra-visibility-admin");
    const cookie = sessionCookieFor("parent@test.com");

    expect((await get(cookie)).status).toBe(403);
    expect((await put(cookie, { standardContentPublic: true })).status).toBe(403);
  });

  it("管理员读取默认关闭，写入后读回开启", async () => {
    setupDb("ra-visibility-admin");
    const cookie = sessionCookieFor("admin@test.com", true);

    const initial = await get(cookie);
    expect(initial.status).toBe(200);
    expect(await initial.json()).toEqual({ standardContentPublic: false });

    const saved = await put(cookie, { standardContentPublic: true });
    expect(saved.status).toBe(200);
    expect(await saved.json()).toEqual({ standardContentPublic: true });

    const reread = await get(cookie);
    expect(await reread.json()).toEqual({ standardContentPublic: true });
  });

  it("请求体不合法 400 BAD_REQUEST", async () => {
    setupDb("ra-visibility-admin");
    const cookie = sessionCookieFor("admin@test.com", true);
    const res = await put(cookie, { standardContentPublic: "yes" });
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("BAD_REQUEST");
  });
});
