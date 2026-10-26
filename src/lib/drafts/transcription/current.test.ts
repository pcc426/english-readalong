import { afterEach, describe, expect, it } from "vitest";
import { FakeTranscriptionService } from "./fake";
import {
  createTranscriptionServiceFromEnv,
  extractAudioFromEnv,
  getTranscriptionService,
  productionStartupCredentialError,
  setTranscriptionService,
  xunfeiTranscriptionConfigured,
} from "./current";
import { XunfeiTranscriptionService } from "./xunfei/service";

const FULL = {
  LFASR_APP_ID: "app123",
  LFASR_API_KEY: "key456",
  LFASR_API_SECRET: "sec789",
};

describe("转写服务工厂（env 开关 fake / 讯飞 LFASR）", () => {
  afterEach(() => {
    delete process.env.LFASR_APP_ID;
    delete process.env.LFASR_API_KEY;
    delete process.env.LFASR_API_SECRET;
    delete process.env.LFASR_EXTRACT_AUDIO;
  });

  it("三件套齐全 → 讯飞适配器；缺任何一个 → 假实现", () => {
    expect(
      createTranscriptionServiceFromEnv({ ...FULL }) instanceof
        XunfeiTranscriptionService
    ).toBe(true);
    for (const key of Object.keys(FULL)) {
      const partial = { ...FULL };
      delete partial[key as keyof typeof FULL];
      expect(
        createTranscriptionServiceFromEnv(partial) instanceof
          FakeTranscriptionService
      ).toBe(true);
    }
    expect(
      createTranscriptionServiceFromEnv({}) instanceof FakeTranscriptionService
    ).toBe(true);
  });

  it("空字符串凭据视为未配置（.env 里留空的键不算配了）", () => {
    expect(
      xunfeiTranscriptionConfigured({ ...FULL, LFASR_API_SECRET: "" })
    ).toBe(false);
  });

  it("extractAudioFromEnv：LFASR_EXTRACT_AUDIO=1/true 开，其余关", () => {
    expect(extractAudioFromEnv({ LFASR_EXTRACT_AUDIO: "1" })).toBe(true);
    expect(extractAudioFromEnv({ LFASR_EXTRACT_AUDIO: "true" })).toBe(true);
    expect(extractAudioFromEnv({ LFASR_EXTRACT_AUDIO: "0" })).toBe(false);
    expect(extractAudioFromEnv({})).toBe(false);
  });

  it("LFASR_EXTRACT_AUDIO 传给适配器（抽音轨开关）", () => {
    const service = createTranscriptionServiceFromEnv({
      ...FULL,
      LFASR_EXTRACT_AUDIO: "1",
    });
    expect(
      service instanceof XunfeiTranscriptionService &&
        (service as XunfeiTranscriptionService).extractAudio
    ).toBe(true);
  });

  it("生产缺凭据 → 抛中文启动错误，不静默假转写（票 13）", () => {
    expect(() =>
      createTranscriptionServiceFromEnv({ NODE_ENV: "production" })
    ).toThrow(/LFASR_APP_ID \/ LFASR_API_KEY \/ LFASR_API_SECRET/);
    // 只差一件也拦：留空键视同未配置
    expect(() =>
      createTranscriptionServiceFromEnv({
        ...FULL,
        LFASR_API_SECRET: "",
        NODE_ENV: "production",
      })
    ).toThrow(/生产环境未配置讯飞转写凭据/);
  });

  it("生产凭据齐全 → 讯飞适配器，不受守卫影响", () => {
    expect(
      createTranscriptionServiceFromEnv({
        ...FULL,
        NODE_ENV: "production",
      }) instanceof XunfeiTranscriptionService
    ).toBe(true);
  });

  it("非生产缺凭据 → 假实现（开发链路照常走通）", () => {
    expect(
      createTranscriptionServiceFromEnv({ NODE_ENV: "test" }) instanceof
        FakeTranscriptionService
    ).toBe(true);
  });

  it("getTranscriptionService 跨调用复用同一实例（否则 submit/poll 分家）", async () => {
    setTranscriptionService(null);
    const first = getTranscriptionService();
    const second = getTranscriptionService();
    expect(second).toBe(first);
    const { taskId } = await first.submit({ videoPath: "acct/clip.mp4" });
    expect(await first.poll(taskId)).toMatchObject({ state: "done" });
    setTranscriptionService(null);
  });
});

describe("productionStartupCredentialError（V0.2 整改：生产启动即报）", () => {
  it("生产缺凭据：列出缺失键名并指向 .env 与 docs/deploy.md", () => {
    const msg = productionStartupCredentialError({ NODE_ENV: "production" });
    expect(msg).toContain("LFASR_APP_ID / LFASR_API_KEY / LFASR_API_SECRET");
    expect(msg).toContain(".env");
    expect(msg).toContain("docs/deploy.md");
  });

  it("只差一件：只列缺的那件", () => {
    const msg = productionStartupCredentialError({
      ...FULL,
      LFASR_API_SECRET: "",
      NODE_ENV: "production",
    });
    expect(msg).toMatch(/缺少讯飞转写凭据：LFASR_API_SECRET 未配置/);
  });

  it("非生产或凭据齐全：null（静默）", () => {
    expect(productionStartupCredentialError({ NODE_ENV: "development" })).toBeNull();
    expect(productionStartupCredentialError({ NODE_ENV: "test" })).toBeNull();
    expect(
      productionStartupCredentialError({ ...FULL, NODE_ENV: "production" })
    ).toBeNull();
    expect(
      productionStartupCredentialError({ ...FULL, NODE_ENV: "test" })
    ).toBeNull();
  });
});
