import { afterEach, describe, expect, it } from "vitest";
import { FakeTranscriptionService } from "./fake";
import {
  createTranscriptionServiceFromEnv,
  extractAudioFromEnv,
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
});
