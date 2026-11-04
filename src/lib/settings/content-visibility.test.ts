import { describe, expect, it } from "vitest";
import { openDb } from "@/lib/db";
import { setupDb } from "@/lib/testing/auth-test-utils";
import {
  canViewStandardContent,
  isStandardContentPublic,
  setStandardContentPublic,
} from "./content-visibility";

describe("标准内容可见性（v0.3.6）", () => {
  it("键缺失时默认关闭", () => {
    const db = setupDb("ra-visibility");
    expect(isStandardContentPublic(db)).toBe(false);
    db.close();
  });

  it("设置后可跨连接读回，也能关回去", () => {
    setupDb("ra-visibility");

    let db = openDb(process.env.DB_PATH!);
    setStandardContentPublic(db, true);
    db.close();

    db = openDb(process.env.DB_PATH!);
    expect(isStandardContentPublic(db)).toBe(true);
    setStandardContentPublic(db, false);
    expect(isStandardContentPublic(db)).toBe(false);
    db.close();
  });

  it("管理员恒可见，普通账号取决于开关", () => {
    const db = setupDb("ra-visibility");

    expect(canViewStandardContent(db, { isAdmin: false })).toBe(false);
    expect(canViewStandardContent(db, { isAdmin: true })).toBe(true);

    setStandardContentPublic(db, true);
    expect(canViewStandardContent(db, { isAdmin: false })).toBe(true);
    db.close();
  });
});
