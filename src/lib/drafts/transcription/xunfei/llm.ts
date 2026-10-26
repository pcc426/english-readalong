import { createHmac } from "node:crypto";
import { parseLfasrSentences } from "./parse";
import {
  createUploadPayloadBuilder,
  type UploadPayloadBuilder,
} from "./payload";
import type {
  TranscriptionPollResult,
  TranscriptionService,
  TranscriptionSubmitInput,
  TranscriptionTask,
} from "../types";

/**
 * 讯飞「录音文件转写大模型」WebAPI 适配器（Ifasr_llm）。
 * 与标准版（raasr.xfyun.cn/v2/api，URL 参数 signa）是两套完全不同的接口：
 * - 域名 https://office-api-ist-dx.iflyaisol.com，POST /v2/upload、/v2/getResult
 * - 鉴权：请求头 signature = base64(HmacSHA1(accessKeySecret, 参数排序拼接))
 * - 参数：appId、accessKeyId、dateTime、signatureRandom、fileSize/fileName、
 *   duration（毫秒）、language；查询额外 orderId/resultType
 * - 只收音频格式，视频必须先 ffmpeg 抽音轨（本适配器恒开抽轨）
 * - 结果在 content.orderResult（字符串化的 lattice → json_1best，句子带 bg/ed 毫秒）
 */

export const DEFAULT_LLM_BASE_URL = "https://office-api-ist-dx.iflyaisol.com";

export interface XunfeiLlmConfig {
  appId: string;
  /** 讯飞开放平台应用 APIKey */
  accessKeyId: string;
  /** 讯飞开放平台应用 APISecret（签名密钥） */
  accessKeySecret: string;
  baseUrl?: string;
  /** 语种：en / autodialect / autominor…（默认 en，本项目练英语） */
  language?: string;
}

export interface XunfeiLlmDeps {
  fetchImpl?: typeof fetch;
  buildPayload?: UploadPayloadBuilder;
  now?: () => number;
  makeRandom?: () => string;
}

const RANDOM_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/** 16 位字母数字随机串（上传与查询必须用同一个） */
export function makeSignatureRandom(): string {
  let out = "";
  for (let i = 0; i < 16; i++) {
    out += RANDOM_ALPHABET[Math.floor(Math.random() * RANDOM_ALPHABET.length)];
  }
  return out;
}

/** 官方 dateTime 格式：yyyy-MM-dd'T'HH:mm:ss±HHmm（本地时区） */
export function formatDateTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  const abs = Math.abs(offset);
  const datePart = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  return `${datePart}${sign}${pad(Math.floor(abs / 60))}${pad(abs % 60)}`;
}

/**
 * 大模型版签名：参数按名排序 → 键值各自 URL 编码 → `k=v&...` → HMAC-SHA1
 * （key = accessKeySecret）→ base64。空值不参与签名，signature 字段本身排除。
 */
export function llmSignature(
  accessKeySecret: string,
  params: Record<string, string>
): string {
  const baseString = Object.keys(params)
    .filter((key) => key !== "signature" && params[key] !== "")
    .sort()
    .map(
      (key) => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`
    )
    .join("&");
  return createHmac("sha1", accessKeySecret)
    .update(baseString, "utf8")
    .digest("base64");
}

export class XunfeiLlmTranscriptionService implements TranscriptionService {
  private readonly config: Required<Pick<XunfeiLlmConfig, "baseUrl" | "language">> &
    XunfeiLlmConfig;
  private readonly fetchImpl: typeof fetch;
  private readonly buildPayload: UploadPayloadBuilder;
  private readonly now: () => number;
  private readonly makeRandom: () => string;

  constructor(config: XunfeiLlmConfig, deps: XunfeiLlmDeps = {}) {
    this.config = { baseUrl: DEFAULT_LLM_BASE_URL, language: "en", ...config };
    this.fetchImpl = deps.fetchImpl ?? fetch;
    // 大模型版只收音频格式：视频一律先 ffmpeg 抽 16k 单声道 wav
    this.buildPayload =
      deps.buildPayload ?? createUploadPayloadBuilder({ extractAudio: true });
    this.now = deps.now ?? Date.now;
    this.makeRandom = deps.makeRandom ?? makeSignatureRandom;
  }

  async submit(input: TranscriptionSubmitInput): Promise<TranscriptionTask> {
    const payload = await this.buildPayload(input.videoPath);
    const signatureRandom = this.makeRandom();
    const params: Record<string, string> = {
      appId: this.config.appId,
      accessKeyId: this.config.accessKeyId,
      dateTime: formatDateTime(new Date(this.now())),
      signatureRandom,
      fileSize: String(payload.data.length),
      fileName: payload.fileName,
      duration: String(payload.durationSec * 1000),
      language: this.config.language,
    };
    const body = await this.request("upload", params, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: payload.data as unknown as BodyInit,
    });
    const orderId = (body.content as { orderId?: unknown } | undefined)?.orderId;
    if (typeof orderId !== "string" || !orderId) {
      throw new Error("讯飞大模型转写上传响应缺少 orderId");
    }
    // 查询接口必须复用同一个 signatureRandom：把两者一起编进任务引用
    return { taskId: `${orderId}|${signatureRandom}` };
  }

  async poll(taskId: string): Promise<TranscriptionPollResult> {
    const [orderId, signatureRandom] = taskId.split("|");
    if (!orderId || !signatureRandom) {
      return { state: "failed", error: "转写任务引用不合法" };
    }
    const body = await this.request(
      "getResult",
      {
        accessKeyId: this.config.accessKeyId,
        dateTime: formatDateTime(new Date(this.now())),
        signatureRandom,
        orderId,
        resultType: "transfer",
      },
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      }
    );

    const content = (body.content ?? {}) as Record<string, unknown>;
    const orderInfo = (content.orderInfo ?? {}) as Record<string, unknown>;
    const status = Number(orderInfo.status);
    if (status === 0 || status === 3) return { state: "pending" };
    if (status === -1) {
      return {
        state: "failed",
        error: `讯飞转写失败（failType=${String(orderInfo.failType ?? "")}）`,
      };
    }
    if (status !== 4) return { state: "pending" };

    const raw = content.orderResult;
    const decoded = typeof raw === "string" ? tryJsonParse(raw) : raw;
    const sentences = parseLfasrSentences(decoded);
    if (sentences.length === 0) {
      return { state: "failed", error: "转写完成但没有识别到任何句子" };
    }
    return { state: "done", sentences };
  }

  private async request(
    endpoint: "upload" | "getResult",
    params: Record<string, string>,
    init: RequestInit
  ): Promise<Record<string, unknown>> {
    const signature = llmSignature(this.config.accessKeySecret, params);
    const query = new URLSearchParams(params).toString();
    const res = await this.fetchImpl(
      `${this.config.baseUrl}/v2/${endpoint}?${query}`,
      { ...init, headers: { ...(init.headers ?? {}), signature } }
    );
    if (!res.ok) {
      throw new Error(`讯飞大模型转写 HTTP ${res.status}（${endpoint}）`);
    }
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      throw new Error(`讯飞大模型转写响应不是 JSON（HTTP ${res.status}）`);
    }
    const record = body as Record<string, unknown>;
    if (String(record.code) !== "000000") {
      throw new Error(
        `讯飞大模型转写错误 ${String(record.code)}：${String(
          record.descInfo ?? "未知错误"
        )}（${endpoint}）`
      );
    }
    return record;
  }
}

function tryJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
