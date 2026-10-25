import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { openDb } from "../db";
import { createAccount } from "../auth/accounts";
import {
  firstAdminAccount,
  migrateNullOwnersToAdmin,
  NoAdminAccountError,
} from "./migrate-owner";

const tmpDirs: string[] = [];
function makeDb() {
  const dir = mkdtempSync(path.join(tmpdir(), "ra-migrate-"));
  tmpDirs.push(dir);
  return openDb(path.join(dir, "test.db"));
}
afterEach(() => {
  for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true });
  tmpDirs.length = 0;
});

type Db = ReturnType<typeof openDb>;

function attempt(
  db: Db,
  owner: string | null,
  score = 90,
  unitId = "u-test",
  sentenceIndex = 0
) {
  db.prepare(
    "INSERT INTO practice_attempts (unit_id, sentence_index, score, stars, owner) VALUES (?, ?, ?, ?, ?)"
  ).run(unitId, sentenceIndex, score, 3, owner);
}

function attemptOwners(db: Db): Array<string | null> {
  return (
    db.prepare("SELECT owner FROM practice_attempts ORDER BY id").all() as Array<{
      owner: string | null;
    }>
  ).map((r) => r.owner);
}

describe("首个管理员账号", () => {
  it("库中没有管理员时抛 NoAdminAccountError", () => {
    const db = makeDb();
    expect(() => firstAdminAccount(db)).toThrow(NoAdminAccountError);
  });

  it("取最早创建的管理员（同秒内按插入序），家长账号不参与", () => {
    const db = makeDb();
    const adminA = createAccount(db, { email: "a@test.com", password: "secret123", isAdmin: true });
    createAccount(db, { email: "p@test.com", password: "secret123" });
    const adminB = createAccount(db, { email: "b@test.com", password: "secret123", isAdmin: true });
    expect(firstAdminAccount(db).id).toBe(adminA.id);
    expect(firstAdminAccount(db).id).not.toBe(adminB.id);
  });
});

describe("NULL 归属一次性迁移到管理员", () => {
  it("只迁 owner 为 NULL 的记录，已有归属不覆盖，返回迁移条数", () => {
    const db = makeDb();
    const admin = createAccount(db, { email: "admin@test.com", password: "secret123", isAdmin: true });
    attempt(db, null); // V0.1 遗留
    attempt(db, null, 80);
    attempt(db, "acct-x", 70); // 已有归属

    const { admin: target, migrated } = migrateNullOwnersToAdmin(db);
    expect(target.id).toBe(admin.id);
    expect(migrated).toBe(2);
    expect(attemptOwners(db)).toEqual([admin.id, admin.id, "acct-x"]);
  });

  it("重复执行幂等：第二次迁移 0 条，数据不变", () => {
    const db = makeDb();
    const admin = createAccount(db, { email: "admin@test.com", password: "secret123", isAdmin: true });
    attempt(db, null);
    expect(migrateNullOwnersToAdmin(db).migrated).toBe(1);
    expect(migrateNullOwnersToAdmin(db).migrated).toBe(0);
    expect(attemptOwners(db)).toEqual([admin.id]);
  });

  it("没有管理员时不做任何改动（报错优先于半成品迁移）", () => {
    const db = makeDb();
    attempt(db, null);
    expect(() => migrateNullOwnersToAdmin(db)).toThrow(NoAdminAccountError);
    expect(attemptOwners(db)).toEqual([null]);
  });
});
