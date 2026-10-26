import type {
  TranscriptionPollResult,
  TranscriptionService,
  TranscriptionSubmitInput,
  TranscriptionTask,
} from "../types";
import {
  createUploadPayloadBuilder,
  type FfmpegRunner,
  type UploadPayloadBuilder,
} from "./payload";
import { isRecord, parseLfasrSentences } from "./parse";
import { lfasrSigna } from "./signa";
import type { DurationProbe } from "../../probe";

export const DEFAULT_LFASR_BASE_URL = "https://raasr.xfyun.cn/v2/api";

/** 订单失败原因表（ifasr_new/API.html failType 字段说明） */
const FAIL_TYPES: Record<string, string> = {
  "1": "上传失败",
  "2": "转码失败",
  "3": "识别失败",
  "4": "音频时长超限",
  "5": "音频校验失败",
  "6": "静音文件",
  "99": "其他错误",
};

export interface XunfeiTranscriptionConfig {
  appId: string;
  apiKey: string;
  apiSecret: string;
  /** 默认官方端点；单测指向假服务 */
  baseUrl?: string;
  /** 识别语种，默认 en（本项目内容为英语） */
  language?: string;
  /** mp4 直接提交待真机确认；开启后先 ffmpeg 抽音轨（LFASR_EXTRACT_AUDIO） */
  extractAudio?: boolean;
  ffmpegBin?: string;
}

export interface XunfeiServiceDeps {
  fetchImpl?: typeof fetch;
  buildPayload?: UploadPayloadBuilder;
  /** 可注入时钟：ts 用十进制秒（签名的一部分） */
  now?: () => number;
  runFfmpeg?: FfmpegRunner;
  probeDurationMs?: DurationProbe;
}

/**
 * 讯飞录音文件转写（LFASR 标准版）适配器，TranscriptionService 的真实实现。
 * 流程：POST /upload（签名三元组拼 URL、文件字节走 body）拿 orderId →
 * GET /getResult 轮询（26605=处理中 → pending；status -1 → failed；
 * status 4 → base64 解开 orderResult 解析句子级 bg/ed/onebest）。
 * 不引入讯飞 SDK，签名与请求手写（node:crypto + fetch）。
 */
export class XunfeiTranscriptionService implements TranscriptionService {
  /** 抽音轨开关（LFASR_EXTRACT_AUDIO 透传，工厂测试断言用） */
  readonly extractAudio: boolean;
  private readonly config: Required<
    Pick<XunfeiTranscriptionConfig, "baseUrl" | "language">
  > &
    XunfeiTranscriptionConfig;
  private readonly fetchImpl: typeof fetch;
  private readonly buildPayload: UploadPayloadBuilder;
  private readonly now: () => number;

  constructor(
    config: XunfeiTranscriptionConfig,
    deps: XunfeiServiceDeps = {}
  ) {
    this.config = {
      baseUrl: DEFAULT_LFASR_BASE_URL,
      language: "en",
      ...config,
    };
    this.extractAudio = config.extractAudio ?? false;
    this.fetchImpl = deps.fetchImpl ?? globalThis.fetch;
    this.now = deps.now ?? Date.now;
    this.buildPayload =
      deps.buildPayload ??
      createUploadPayloadBuilder({
        extractAudio: config.extractAudio,
        ffmpegBin: config.ffmpegBin,
        probeDurationMs: deps.probeDurationMs,
        runFfmpeg: deps.runFfmpeg,
      });
  }

  async submit(input: TranscriptionSubmitInput): Promise<TranscriptionTask> {
    const payload = await this.buildPayload(input.videoPath);
    const body = await this.request("upload", (params) => {
      params.set("fileName", payload.fileName);
      params.set("fileSize", String(payload.data.length));
      params.set("duration", String(payload.durationSec));
      params.set("language", this.config.language);
      // 文件流模式：音频字节放 body，Content-Type 必须是 octet-stream
      return {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: payload.data,
      } as RequestInit;
    });
    const orderId = (body.content as { orderId?: unknown } | undefined)?.orderId;
    if (typeof orderId !== "string" || !orderId) {
      throw new Error("讯飞转写上传响应缺少 orderId");
    }
    return { taskId: orderId };
  }

  async poll(taskId: string): Promise<TranscriptionPollResult> {
    const body = await this.request("getResult", (params) => {
      params.set("orderId", taskId);
      return { method: "GET" } as RequestInit;
    });
    const content = (body.content ?? {}) as Record<string, unknown>;
    const orderInfo = (content.orderInfo ?? {}) as Record<string, unknown>;
    const status = orderInfo.status;
    if (status === -1) {
      return { state: "failed", error: failMessage(orderInfo.failType) };
    }
    if (status !== 4) {
      // 0 排队中 / 3 处理中 / 未知状态一律按进行中，等下一轮
      return { state: "pending" };
    }
    const decoded = decodeOrderResult(content.orderResult);
    if (isRecord(decoded) && decoded.type === "1") {
      const inner = (decoded.orderInfo ?? {}) as Record<string, unknown>;
      return { state: "failed", error: failMessage(inner.failType) };
    }
    const sentences = parseLfasrSentences(decoded);
    if (sentences.length === 0) {
      // 完成但没有句子：对跟读内容来说等于不可用，按失败保持可重试
      return { state: "failed", error: "讯飞转写完成但未识别到语音内容" };
    }
    return { state: "done", sentences };
  }

  /**
   * 统一请求：签名三元组（appid/ts/signa）拼 URL，extra 由端点补充。
   * code 26605 = 任务处理中（轮询的正常中间态）；其他非 000000 抛错，
   * 由轮询循环退避重试——失败不吞、草稿不丢。
   */
  private async request(
    endpoint: "upload" | "getResult",
    buildInit: (params: URLSearchParams) => RequestInit
  ): Promise<Record<string, unknown>> {
    const params = this.authParams();
    const init = buildInit(params);
    const res = await this.fetchImpl(
      `${this.config.baseUrl}/${endpoint}?${params.toString()}`,
      init
    );
    if (!res.ok) {
      throw new Error(`讯飞转写接口 HTTP ${res.status}（${endpoint}）`);
    }
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      throw new Error(`讯飞转写接口响应不是 JSON（HTTP ${res.status}）`);
    }
    const record = body as Record<string, unknown>;
    if (record.code === "26605") {
      return { code: "26605" };
    }
    if (record.code !== "000000") {
      throw new Error(
        `讯飞转写接口错误 ${String(record.code)}：${String(record.descInfo ?? "未知错误")}（${endpoint}）`
      );
    }
    return record;
  }

  /** appid + 十进制秒 ts + signa（官方签名公式，HMAC key 是 APISecret，见 signa.ts） */
  private authParams(): URLSearchParams {
    const ts = Math.floor(this.now() / 1000).toString();
    const signa = lfasrSigna(
      this.config.appId,
      this.config.apiSecret,
      ts
    );
    const params = new URLSearchParams();
    // 官方示例的参数名是驼峰 appId；写成小写 appid 会被判 26610 appId illegal
    params.set("appId", this.config.appId);
    params.set("ts", ts);
    params.set("signa", signa);
    return params;
  }
}

function failMessage(failType: unknown): string {
  const num = String(failType ?? "");
  const label = FAIL_TYPES[num] ?? "未知原因";
  return `讯飞转写失败（failType=${num || "无"} ${label}）`;
}

/** orderResult 是 base64 包着的 JSON 字符串；容忍直接给对象/已解码的变体 */
function decodeOrderResult(raw: unknown): unknown {
  if (typeof raw !== "string") return raw ?? null;
  if (!raw) return null;
  // 实测标准版返回明文 JSON 字符串；历史文档/SDK 也有 base64 形态，两种都收
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    // 继续尝试 base64
  }
  try {
    return JSON.parse(Buffer.from(raw, "base64").toString("utf8")) as unknown;
  } catch {
    return null;
  }
}
