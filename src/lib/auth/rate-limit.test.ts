import { describe, it, expect, afterEach, vi } from "vitest";
import {
  recordLoginFailure,
  clearLoginFailures,
  getLoginLockRemainingMs,
  MAX_LOGIN_FAILURES,
  LOGIN_LOCK_MS,
} from "./rate-limit";

afterEach(() => {
  vi.useRealTimers();
});

describe("登录限速", () => {
  it(`连续失败 ${MAX_LOGIN_FAILURES} 次触发临时锁定`, () => {
    const email = "lock@test.com";
    for (let i = 0; i < MAX_LOGIN_FAILURES; i++) recordLoginFailure(email);
    expect(getLoginLockRemainingMs(email)).toBeGreaterThan(0);
  });

  it("未达阈值不锁定", () => {
    const email = "few@test.com";
    recordLoginFailure(email);
    recordLoginFailure(email);
    expect(getLoginLockRemainingMs(email)).toBe(0);
  });

  it(`锁定 ${LOGIN_LOCK_MS} 后自动解锁，且重新计数`, () => {
    vi.useFakeTimers();
    const email = "expire@test.com";
    for (let i = 0; i < MAX_LOGIN_FAILURES; i++) recordLoginFailure(email);
    expect(getLoginLockRemainingMs(email)).toBeGreaterThan(0);

    vi.setSystemTime(Date.now() + LOGIN_LOCK_MS + 1);
    expect(getLoginLockRemainingMs(email)).toBe(0);
    // 解锁后从头计数：一次失败不再锁定
    recordLoginFailure(email);
    expect(getLoginLockRemainingMs(email)).toBe(0);
  });

  it("成功登录清除失败计数，从零重新累计", () => {
    const email = "clear@test.com";
    for (let i = 0; i < MAX_LOGIN_FAILURES - 1; i++) recordLoginFailure(email);
    clearLoginFailures(email);
    recordLoginFailure(email);
    expect(getLoginLockRemainingMs(email)).toBe(0);
  });

  it("锁定期间继续失败不延长锁定", () => {
    vi.useFakeTimers();
    const email = "hold@test.com";
    for (let i = 0; i < MAX_LOGIN_FAILURES; i++) recordLoginFailure(email);
    const first = getLoginLockRemainingMs(email);
    for (let i = 0; i < 3; i++) recordLoginFailure(email);
    expect(getLoginLockRemainingMs(email)).toBe(first);
  });

  it("按邮箱小写归一后记数", () => {
    const email = "Case@Test.com";
    for (let i = 0; i < MAX_LOGIN_FAILURES; i++)
      recordLoginFailure(email.toUpperCase());
    expect(getLoginLockRemainingMs("case@test.com")).toBeGreaterThan(0);
  });
});
