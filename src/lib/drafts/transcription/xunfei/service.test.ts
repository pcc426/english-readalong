import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { XunfeiTranscriptionService } from "./service";
import type { UploadPayloadBuilder } from "./payload";

const CONFIG = {
  appId: "app123",
  apiKey: "key456",
  apiSecret: "sec789",
  baseUrl: "https://raasr.test/v2/api",
  language: "en",
} as const;

/** 固定 ts 让 signa 可断言（service 的 now 可注入） */
const NOW = 1_700_000_000_000;
// 独立向量（openssl 手算，不调被测函数）：HMAC-SHA1(key=apiSecret, data=MD5hex(appid+ts))
const EXPECTED_SIGNA = "6WNUcxjozoUMxGbcfq6rrxA19fU=";

function okJson(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 });
}

/** 恒定负载构造器：不碰磁盘，返回固定字节，供 service 单测注入 */
const stubPayload: UploadPayloadBuilder = async () => ({
  data: Buffer.from("fake-video-bytes"),
  fileName: "clip.mp4",
  durationSec: 12,
});

/** 记录请求的假 fetch */
function fakeFetch(handler: (url: URL, init: RequestInit) => Response) {
  const calls: Array<{ url: URL; init: RequestInit }> = [];
  const fn = async (input: string | URL, init: RequestInit = {}) => {
    const url = new URL(String(input));
    calls.push({ url, init });
    return handler(url, init);
  };
  return { calls, fn: fn as typeof fetch };
}

function serviceWith(
  fetchImpl: typeof fetch,
  config: Partial<typeof CONFIG> = {}
) {
  return new XunfeiTranscriptionService(
    { ...CONFIG, ...config },
    { fetchImpl, buildPayload: stubPayload, now: () => NOW }
  );
}

describe("XunfeiTranscriptionService.submit", () => {
  afterEach(() => {
    delete process.env.UPLOADS_DIR;
  });

  it("POST 上传端点：appid/ts/signa 进 URL，文件字节走 body（octet-stream）", async () => {
    const { calls, fn } = fakeFetch(() =>
      okJson({ code: "000000", descInfo: "成功", content: { orderId: "order-1" } })
    );
    const service = serviceWith(fn);
    const { taskId } = await service.submit({ videoPath: "a1/clip.mp4" });

    expect(taskId).toBe("order-1");
    expect(calls).toHaveLength(1);
    const { url, init } = calls[0];
    expect(url.pathname).toBe("/v2/api/upload");
    expect(init.method).toBe("POST");
    expect(url.searchParams.get("appId")).toBe("app123");
    expect(url.searchParams.get("ts")).toBe("1700000000");
    expect(url.searchParams.get("signa")).toBe(EXPECTED_SIGNA);
    expect(url.searchParams.get("fileName")).toBe("clip.mp4");
    expect(url.searchParams.get("fileSize")).toBe(String("fake-video-bytes".length));
    expect(url.searchParams.get("duration")).toBe("12");
    expect(url.searchParams.get("language")).toBe("en");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/octet-stream"
    );
    expect(Buffer.from(init.body as Uint8Array).toString()).toBe(
      "fake-video-bytes"
    );
  });

  it("讯飞返回非 000000：抛出带错误码与描述的错（由调用方落 transcribe_error）", async () => {
    const { fn } = fakeFetch(() =>
      okJson({ code: "26601", descInfo: "非法应用信息" })
    );
    const service = serviceWith(fn);
    await expect(service.submit({ videoPath: "a1/clip.mp4" })).rejects.toThrow(
      /26601.*非法应用信息/
    );
  });

  it("HTTP 非 200 / 非 JSON 响应：抛出含状态码的错", async () => {
    const { fn } = fakeFetch(
      () => new Response("Internal Server Error", { status: 500 })
    );
    const service = serviceWith(fn);
    await expect(service.submit({ videoPath: "a1/clip.mp4" })).rejects.toThrow(
      /500/
    );
  });
});

describe("XunfeiTranscriptionService.poll", () => {
  it("26605（任务处理中）→ pending", async () => {
    const { fn } = fakeFetch(() =>
      okJson({ code: "26605", descInfo: "任务正在处理中，请稍后重试" })
    );
    const service = serviceWith(fn);
    expect(await service.poll("order-1")).toEqual({ state: "pending" });
  });

  it("getResult 的 URL 带签名三元组与 orderId（GET）", async () => {
    const { calls, fn } = fakeFetch(() =>
      okJson({ code: "26605", descInfo: "处理中" })
    );
    const service = serviceWith(fn);
    await service.poll("order-9");
    const { url } = calls[0];
    expect(url.pathname).toBe("/v2/api/getResult");
    expect(url.searchParams.get("orderId")).toBe("order-9");
    expect(url.searchParams.get("signa")).toBe(EXPECTED_SIGNA);
  });

  it("status 0/3（排队/处理中）→ pending", async () => {
    for (const status of [0, 3]) {
      const { fn } = fakeFetch(() =>
        okJson({
          code: "000000",
          content: { orderInfo: { status }, orderResult: "" },
        })
      );
      const service = serviceWith(fn);
      expect(await service.poll("order-1")).toEqual({ state: "pending" });
    }
  });

  it("status -1：failType 映射为可读失败原因", async () => {
    const { fn } = fakeFetch(() =>
      okJson({
        code: "000000",
        content: { orderInfo: { status: -1, failType: 3 } },
      })
    );
    const service = serviceWith(fn);
    const result = await service.poll("order-1");
    expect(result).toEqual({
      state: "failed",
      error: expect.stringContaining("识别失败"),
    });
  });

  it("status 4 + orderResult（base64 的 onebest 形态）→ done 带句子", async () => {
    const transcript = [
      { bg: "0", ed: "3200", onebest: "Hello, Kitty!" },
      { bg: "3400", ed: "6100", onebest: "What is your name?" },
    ];
    const { fn } = fakeFetch(() =>
      okJson({
        code: "000000",
        content: {
          orderInfo: { status: 4 },
          orderResult: Buffer.from(
            JSON.stringify({ type: "0", orderInfo: { status: 4 }, data: transcript })
          ).toString("base64"),
        },
      })
    );
    const service = serviceWith(fn);
    const result = await service.poll("order-1");
    expect(result).toEqual({
      state: "done",
      sentences: [
        { text: "Hello, Kitty!", startMs: 0, endMs: 3200 },
        { text: "What is your name?", startMs: 3400, endMs: 6100 },
      ],
    });
  });

  it("orderResult 里 type=1（引擎侧失败）→ failed", async () => {
    const { fn } = fakeFetch(() =>
      okJson({
        code: "000000",
        content: {
          orderInfo: { status: 4 },
          orderResult: Buffer.from(
            JSON.stringify({ type: "1", orderInfo: { failType: 2 } })
          ).toString("base64"),
        },
      })
    );
    const service = serviceWith(fn);
    const result = await service.poll("order-1");
    expect(result.state).toBe("failed");
    expect((result as { error: string }).error).toContain("转码失败");
  });

  it("转写完成但识别不到任何内容：failed（空 proofreading 页没有意义，保持可重试）", async () => {
    const { fn } = fakeFetch(() =>
      okJson({
        code: "000000",
        content: {
          orderInfo: { status: 4 },
          orderResult: Buffer.from(
            JSON.stringify({ type: "0", data: [] })
          ).toString("base64"),
        },
      })
    );
    const service = serviceWith(fn);
    const result = await service.poll("order-1");
    expect(result.state).toBe("failed");
    expect((result as { error: string }).error.length).toBeGreaterThan(0);
  });

  it("其他非 000000 错误码：抛错（网络/服务抖动，交给轮询循环退避重试）", async () => {
    const { fn } = fakeFetch(() => okJson({ code: "26610", descInfo: "服务繁忙" }));
    const service = serviceWith(fn);
    await expect(service.poll("order-1")).rejects.toThrow(/26610/);
  });
});

describe("XunfeiTranscriptionService 负载构造（默认走磁盘与 ffmpeg 缝）", () => {
  afterEach(() => {
    delete process.env.UPLOADS_DIR;
  });

  function setupUploadsDir(): string {
    const dir = mkdtempSync(path.join(tmpdir(), "ra-lfasr-"));
    mkdirSync(path.join(dir, "a1"), { recursive: true });
    process.env.UPLOADS_DIR = dir;
    return dir;
  }

  it("默认直接读原视频字节，文件名带原扩展名", async () => {
    const dir = setupUploadsDir();
    writeFileSync(path.join(dir, "a1", "clip.mp4"), Buffer.from("mp4-data"));
    const { calls, fn } = fakeFetch(() =>
      okJson({ code: "000000", content: { orderId: "o" } })
    );
    const service = new XunfeiTranscriptionService(CONFIG, {
      fetchImpl: fn,
      probeDurationMs: async () => 5000,
      now: () => NOW,
    });
    await service.submit({ videoPath: "a1/clip.mp4" });
    const url = calls[0].url;
    expect(url.searchParams.get("fileName")).toBe("clip.mp4");
    expect(url.searchParams.get("fileSize")).toBe("8");
    expect(url.searchParams.get("duration")).toBe("5");
    expect(Buffer.from(calls[0].init.body as Uint8Array).toString()).toBe(
      "mp4-data"
    );
    rmSync(dir, { recursive: true, force: true });
  });

  it("extractAudio 开启：ffmpeg 抽轨产物提交，文件名换成 .wav", async () => {
    const dir = setupUploadsDir();
    writeFileSync(path.join(dir, "a1", "clip.mp4"), Buffer.from("mp4-data"));
    const { calls, fn } = fakeFetch(() =>
      okJson({ code: "000000", content: { orderId: "o" } })
    );
    const service = new XunfeiTranscriptionService(
      { ...CONFIG, extractAudio: true },
      {
        fetchImpl: fn,
        probeDurationMs: async () => null,
        now: () => NOW,
        // 假 ffmpeg：在约定的输出路径写点字节，模拟抽轨成功
        runFfmpeg: async (_bin, args) => {
          const outIndex = args.indexOf("-y");
          const outPath = args[args.length - 1];
          expect(outIndex).toBeGreaterThan(-1);
          expect(outPath.endsWith(".wav")).toBe(true);
          writeFileSync(outPath, Buffer.from("wav-data"));
        },
      }
    );
    await service.submit({ videoPath: "a1/clip.mp4" });
    expect(calls[0].url.searchParams.get("fileName")).toBe("clip.wav");
    expect(Buffer.from(calls[0].init.body as Uint8Array).toString()).toBe(
      "wav-data"
    );
    rmSync(dir, { recursive: true, force: true });
  });

  it("extractAudio 开启但 ffmpeg 不存在：明确报错（不是含糊的 spawn 失败）", async () => {
    const dir = setupUploadsDir();
    writeFileSync(path.join(dir, "a1", "clip.mp4"), Buffer.from("mp4-data"));
    const err = Object.assign(new Error("spawn ffmpeg ENOENT"), {
      code: "ENOENT",
    });
    const service = new XunfeiTranscriptionService(
      { ...CONFIG, extractAudio: true },
      {
        fetchImpl: async () => okJson({}),
        probeDurationMs: async () => null,
        now: () => NOW,
        runFfmpeg: async () => {
          throw err;
        },
      }
    );
    await expect(service.submit({ videoPath: "a1/clip.mp4" })).rejects.toThrow(
      /ffmpeg.*LFASR_EXTRACT_AUDIO|LFASR_EXTRACT_AUDIO.*ffmpeg/
    );
    rmSync(dir, { recursive: true, force: true });
  });
});
