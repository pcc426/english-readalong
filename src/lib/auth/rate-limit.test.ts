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
    for (let i = 0; i < MAX_LOGIN_FAILURES; i++) recordLoginFailure(email, "ip-lock");
    expect(getLoginLockRemainingMs(email, "ip-lock")).toBeGreaterThan(0);
  });

  it("未达阈值不锁定", () => {
    const email = "few@test.com";
    recordLoginFailure(email, "ip-few");
    recordLoginFailure(email, "ip-few");
    expect(getLoginLockRemainingMs(email, "ip-few")).toBe(0);
  });

  it(`锁定 ${LOGIN_LOCK_MS} 后自动解锁，且重新计数`, () => {
    vi.useFakeTimers();
    const email = "expire@test.com";
    for (let i = 0; i < MAX_LOGIN_FAILURES; i++) recordLoginFailure(email, "ip-expire");
    expect(getLoginLockRemainingMs(email, "ip-expire")).toBeGreaterThan(0);

    vi.setSystemTime(Date.now() + LOGIN_LOCK_MS + 1);
    expect(getLoginLockRemainingMs(email, "ip-expire")).toBe(0);
    // 解锁后从头计数：一次失败不再锁定
    recordLoginFailure(email, "ip-expire");
    expect(getLoginLockRemainingMs(email, "ip-expire")).toBe(0);
  });

  it("成功登录清除失败计数，从零重新累计", () => {
    const email = "clear@test.com";
    for (let i = 0; i < MAX_LOGIN_FAILURES - 1; i++) recordLoginFailure(email, "ip-clear");
    clearLoginFailures(email, "ip-clear");
    recordLoginFailure(email, "ip-clear");
    expect(getLoginLockRemainingMs(email, "ip-clear")).toBe(0);
  });

  it("锁定期间继续失败不延长锁定", () => {
    vi.useFakeTimers();
    const email = "hold@test.com";
    for (let i = 0; i < MAX_LOGIN_FAILURES; i++) recordLoginFailure(email, "ip-hold");
    const first = getLoginLockRemainingMs(email, "ip-hold");
    for (let i = 0; i < 3; i++) recordLoginFailure(email, "ip-hold");
    expect(getLoginLockRemainingMs(email, "ip-hold")).toBe(first);
  });

  it("按邮箱小写归一后记数", () => {
    const email = "Case@Test.com";
    for (let i = 0; i < MAX_LOGIN_FAILURES; i++)
      recordLoginFailure(email.toUpperCase(), "ip-case");
    expect(getLoginLockRemainingMs("case@test.com", "ip-case")).toBeGreaterThan(0);
  });

  // 邮箱与 IP 是两个独立维度，各记一份失败计数；以下用例各用独立 IP/邮箱，
  // 避免模块级共享计数在不同用例间互相污染。
  it("同邮箱不同 IP 的失败累计：邮箱维度达阈值即锁（挡同邮箱爆破）", () => {
    const email = "spray@test.com";
    for (let i = 0; i < 3; i++) recordLoginFailure(email, "ip-spray-a");
    for (let i = 0; i < MAX_LOGIN_FAILURES - 3; i++)
      recordLoginFailure(email, "ip-spray-b");
    // 两个 IP 各自都未达阈值，但邮箱维度已满 → 换 IP 来试也被拒
    expect(getLoginLockRemainingMs(email, "ip-spray-c")).toBeGreaterThan(0);
  });

  it("同 IP 不同邮箱的失败累计：IP 维度达阈值即锁（挡同 IP 撞库）", () => {
    for (let i = 0; i < 3; i++) recordLoginFailure("ipblast-a@test.com", "ip-blast");
    for (let i = 0; i < MAX_LOGIN_FAILURES - 3; i++)
      recordLoginFailure("ipblast-b@test.com", "ip-blast");
    // 两个邮箱各自都未达阈值，但该 IP 已满 → 换邮箱也被拒
    expect(getLoginLockRemainingMs("ipblast-c@test.com", "ip-blast")).toBeGreaterThan(0);
  });
});
