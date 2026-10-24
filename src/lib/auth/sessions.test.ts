import { describe, it, expect } from "vitest";
import { setupDb } from "@/lib/testing/auth-test-utils";
import { openDb } from "@/lib/db";
import { createAccount } from "./accounts";
import { createSession, getAccountBySession, deleteSession } from "./sessions";

function seedAccount(db: ReturnType<typeof openDb>) {
  return createAccount(db, { email: "fam@test.com", password: "secret123" });
}

describe("sessions", () => {
  it("创建会话返回随机不透明 id，可换回对应账号", () => {
    const db = setupDb();
    const account = seedAccount(db);
    const idA = createSession(db, account.id);
    const idB = createSession(db, account.id);
    // 不透明随机 id：两次创建不同、足够长（256-bit 随机的 base64url 形态）
    expect(idA).not.toBe(idB);
    expect(idA.length).toBeGreaterThanOrEqual(40);

    const loaded = getAccountBySession(db, idA);
    expect(loaded?.id).toBe(account.id);
    expect(loaded?.email).toBe("fam@test.com");
    expect(loaded?.isAdmin).toBe(false);
  });

  it("过期会话不可用（读取侧校验过期时间）", () => {
    const db = setupDb();
    const account = seedAccount(db);
    const id = createSession(db, account.id);
    // 直接把过期时间拨到过去，验证读取侧拒绝
    db.prepare("UPDATE sessions SET expires_at = ? WHERE id = ?").run(
      new Date(Date.now() - 1000).toISOString(),
      id
    );
    expect(getAccountBySession(db, id)).toBeUndefined();
  });

  it("退出即失效：deleteSession 后会话读取不到", () => {
    const db = setupDb();
    const account = seedAccount(db);
    const id = createSession(db, account.id);
    deleteSession(db, id);
    expect(getAccountBySession(db, id)).toBeUndefined();
  });

  it("未知会话 id 返回 undefined", () => {
    const db = setupDb();
    expect(getAccountBySession(db, "nope")).toBeUndefined();
  });
});
