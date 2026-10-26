import { describe, expect, it } from "vitest";
import {
  formatDateTime,
  llmSignature,
  XunfeiLlmTranscriptionService,
} from "./llm";

const CONFIG = {
  appId: "app123",
  accessKeyId: "key456",
  accessKeySecret: "sec789",
};

function fakePayload(durationSec = 3) {
  return async () => ({
    data: Buffer.from([1, 2, 3, 4]),
    fileName: "clip.wav",
    durationSec,
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** 大模型版完成态：orderResult 是字符串化的 lattice → json_1best（再字符串化） */
function doneOrderResult(): string {
  const frame = (bg: string, ed: string, words: string[]) =>
    JSON.stringify({
      st: {
        bg,
        ed,
        rt: [
          {
            ws: words.map((w) => ({ cw: [{ w }] })),
          },
        ],
      },
    });
  return JSON.stringify({
    lattice: [
      { json_1best: frame("880", "1680", ["Hello", " there"]) },
      { json_1best: frame("2390", "3640", ["How are you?"]) },
    ],
  });
}

describe("llmSignature（大模型版请求头签名）", () => {
  it("参数排序、URL 编码后 HMAC-SHA1（独立向量）", () => {
    expect(
      llmSignature("sec789", {
        appId: "app123",
        accessKeyId: "key456",
        dateTime: "2025-01-01T00:00:00+0800",
        signatureRandom: "abcd1234efgh5678",
        orderId: "order-9",
        resultType: "transfer",
      })
    ).toBe("QOYEtKPWACEeNGY8fGkoltklmkI=");
  });

  it("空值不参与签名；signature 字段自身排除", () => {
    const a = llmSignature("s", { a: "1", b: "" });
    const b = llmSignature("s", { a: "1", b: "", signature: "x" });
    expect(a).toBe(b);
  });
});

describe("formatDateTime", () => {
  it("格式为 yyyy-MM-dd'T'HH:mm:ss±HHmm", () => {
    expect(formatDateTime(new Date(2025, 0, 1, 0, 0, 0))).toMatch(
      /^2025-01-01T00:00:00[+-]\d{4}$/
    );
  });
});

describe("XunfeiLlmTranscriptionService", () => {
  it("上传：参数齐全、duration 用毫秒、带 signature 请求头", async () => {
    let capturedUrl = "";
    let capturedInit: RequestInit | undefined;
    const service = new XunfeiLlmTranscriptionService(CONFIG, {
      buildPayload: fakePayload(3),
      now: () => 1735689600000,
      makeRandom: () => "abcd1234efgh5678",
      fetchImpl: (async (url: string | URL | Request, init?: RequestInit) => {
        capturedUrl = String(url);
        capturedInit = init;
        return jsonResponse({
          code: "000000",
          content: { orderId: "order-9" },
        });
      }) as typeof fetch,
    });

    const { taskId } = await service.submit({ videoPath: "acct/clip.mp4" });
    expect(taskId).toBe("order-9|abcd1234efgh5678");

    const url = new URL(capturedUrl);
    expect(url.pathname).toBe("/v2/upload");
    const p = url.searchParams;
    expect(p.get("appId")).toBe("app123");
    expect(p.get("accessKeyId")).toBe("key456");
    expect(p.get("dateTime")).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{4}$/);
    expect(p.get("signatureRandom")).toBe("abcd1234efgh5678");
    expect(p.get("fileSize")).toBe("4");
    expect(p.get("fileName")).toBe("clip.wav");
    expect(p.get("duration")).toBe("3000");
    expect(p.get("language")).toBe("en");
    const params: Record<string, string> = {};
    p.forEach((v, k) => (params[k] = v));
    expect(capturedInit?.headers).toMatchObject({
      signature: llmSignature("sec789", params),
    });
  });

  it("查询：status 3 处理中 → pending", async () => {
    const service = new XunfeiLlmTranscriptionService(CONFIG, {
      buildPayload: fakePayload(),
      fetchImpl: (async () =>
        jsonResponse({
          code: "000000",
          content: { orderInfo: { status: 3 } },
        })) as typeof fetch,
    });
    expect(await service.poll("order-9|r1")).toEqual({ state: "pending" });
  });

  it("查询：status 4 + orderResult（双重字符串化 lattice）→ 句子级时间", async () => {
    const service = new XunfeiLlmTranscriptionService(CONFIG, {
      buildPayload: fakePayload(),
      fetchImpl: (async () =>
        jsonResponse({
          code: "000000",
          content: {
            orderInfo: { status: 4 },
            orderResult: doneOrderResult(),
          },
        })) as typeof fetch,
    });
    const result = await service.poll("order-9|r1");
    expect(result).toEqual({
      state: "done",
      sentences: [
        { text: "Hello there", startMs: 880, endMs: 1680 },
        { text: "How are you?", startMs: 2390, endMs: 3640 },
      ],
    });
  });

  it("查询：status -1 → failed 带 failType", async () => {
    const service = new XunfeiLlmTranscriptionService(CONFIG, {
      buildPayload: fakePayload(),
      fetchImpl: (async () =>
        jsonResponse({
          code: "000000",
          content: { orderInfo: { status: -1, failType: 2 } },
        })) as typeof fetch,
    });
    const result = await service.poll("order-9|r1");
    expect(result).toMatchObject({ state: "failed" });
    expect((result as { error: string }).error).toContain("failType=2");
  });

  it("业务码非 000000：抛带码与描述的错", async () => {
    const service = new XunfeiLlmTranscriptionService(CONFIG, {
      buildPayload: fakePayload(),
      fetchImpl: (async () =>
        jsonResponse({
          code: 100003,
          descInfo: "dateTime format must be [yyyy-MM-dd'T'HH:mm:ssZ]",
        })) as typeof fetch,
    });
    await expect(
      service.submit({ videoPath: "acct/clip.mp4" })
    ).rejects.toThrow(/100003.*dateTime/);
  });

  it("任务引用缺失随机串 → failed（不误发请求）", async () => {
    const service = new XunfeiLlmTranscriptionService(CONFIG, {
      buildPayload: fakePayload(),
    });
    expect(await service.poll("order-only")).toMatchObject({
      state: "failed",
    });
  });
});
