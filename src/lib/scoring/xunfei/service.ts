import {
  buildXfAuthUrl,
  buildXfFirstFrame,
  parseXfFinalResult,
  xfAudioPayload,
  XF_HOST,
  XF_PATH,
} from "./params";
import type { ScoringRequest, ScoringResult, ScoringService } from "../types";

// 官方上限：单帧原始音频 ≤19200B（base64 后 ≤26000）
const FRAME_BYTES = 19200;
const TIMEOUT_MS = 15_000;

interface XfResponse {
  code: number;
  message?: string;
  sid?: string;
  data?: { status: number; data?: string; action?: string };
}

/**
 * 讯飞 ISE read_sentence 真实现（ADR-0001）。
 * 输入须为 16kHz/16bit 单声道 WAV——AAC/M4A 由调用方先经 transcodeTo16kWav 转码。
 * 每次调用记录一行日志（成功/失败 + 耗时），便于排查与观察额度消耗。
 */
export class XunfeiScoringService implements ScoringService {
  private opts: { appId: string; apiKey: string; apiSecret: string };

  constructor(opts: { appId: string; apiKey: string; apiSecret: string }) {
    this.opts = opts;
  }

  async score({ text, audioWav }: ScoringRequest): Promise<ScoringResult> {
    const startedAt = Date.now();
    try {
      const score = await this.callXunfei(text, audioWav);
      console.log(
        `[scoring] xunfei ok score=${score.toFixed(1)} bytes=${audioWav.length} ms=${Date.now() - startedAt}`
      );
      return { score };
    } catch (err) {
      console.error(
        `[scoring] xunfei FAIL ms=${Date.now() - startedAt} err=${(err as Error).message}`
      );
      throw err;
    }
  }

  private callXunfei(text: string, audioWav: Buffer): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      const date = new Date().toUTCString();
      const url = buildXfAuthUrl(
        XF_HOST,
        XF_PATH,
        this.opts.apiKey,
        this.opts.apiSecret,
        date
      );
      const ws = new WebSocket(url);
      const fail = (err: Error) => {
        try {
          ws.close();
        } catch {
          /* 已关闭 */
        }
        reject(err);
      };
      const timer = setTimeout(
        () => fail(new Error(`讯飞评测超时（${TIMEOUT_MS}ms）`)),
        TIMEOUT_MS
      );
      const settle = (score: number) => {
        clearTimeout(timer);
        try {
          ws.close();
        } catch {
          /* 已关闭 */
        }
        resolve(score);
      };

      ws.addEventListener("open", () => {
        ws.send(JSON.stringify(buildXfFirstFrame({ appId: this.opts.appId, text })));
        const payload = xfAudioPayload(audioWav);
        const frames = Math.ceil(payload.length / FRAME_BYTES);
        // 官方 demo 按 40ms/帧的实时节奏发送；一次性灌入会导致引擎只认到开头几个词
        const pace = async () => {
          for (let i = 0; i < frames; i++) {
            const isLast = i === frames - 1;
            ws.send(
              JSON.stringify({
                business: { cmd: "auw", aus: i === 0 ? 1 : isLast ? 4 : 2 },
                data: {
                  status: isLast ? 2 : 1,
                  data: payload
                    .subarray(i * FRAME_BYTES, (i + 1) * FRAME_BYTES)
                    .toString("base64"),
                },
              })
            );
            if (!isLast) await new Promise((r) => setTimeout(r, 40));
          }
        };
        void pace().catch(reject);
      });

      ws.addEventListener("message", (ev) => {
        let res: XfResponse;
        try {
          res = JSON.parse(String(ev.data));
        } catch {
          return fail(new Error("讯飞返回了无法解析的帧"));
        }
        if (res.code !== 0) {
          return fail(new Error(`讯飞错误码 ${res.code}: ${res.message ?? "未知"}`));
        }
        if (res.data?.status === 2 && res.data.data) {
          const xml = Buffer.from(res.data.data, "base64").toString("utf8");
          if (process.env.XFYUN_DEBUG) console.log(`[scoring] 原始结果 XML: ${xml}`);
          settle(parseXfFinalResult(xml));
        }
        // status 1 为中间帧（无结果），继续等待
      });

      ws.addEventListener("error", () =>
        fail(new Error("讯飞 WebSocket 连接失败（网络或鉴权被拒）"))
      );
    });
  }
}

/** 从环境变量构造评测服务（讯飞密钥只走环境变量，ADR-0001）。 */
export function createScoringServiceFromEnv(env: NodeJS.ProcessEnv = process.env) {
  const { XFYUN_APPID, XFYUN_API_KEY, XFYUN_API_SECRET } = env;
  if (!XFYUN_APPID || !XFYUN_API_KEY || !XFYUN_API_SECRET) {
    throw new Error(
      "缺少讯飞密钥环境变量：XFYUN_APPID / XFYUN_API_KEY / XFYUN_API_SECRET（参考 .env.example）"
    );
  }
  return new XunfeiScoringService({
    appId: XFYUN_APPID,
    apiKey: XFYUN_API_KEY,
    apiSecret: XFYUN_API_SECRET,
  });
}
