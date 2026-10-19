import { createHmac } from "node:crypto";

export const XF_HOST = "ise-api.xfyun.cn";
export const XF_PATH = "/v2/open-ise";

/**
 * 构造讯飞 WebSocket 鉴权 URL。
 * 签名规则（官方文档）：signature_origin = "host: $host\ndate: $date\nGET $path HTTP/1.1"，
 * HMAC-SHA256(apiSecret) 后 base64，再拼进 authorization_origin 整体 base64。
 */
export function buildXfAuthUrl(
  host: string,
  path: string,
  apiKey: string,
  apiSecret: string,
  date: string
): string {
  const origin = `host: ${host}\ndate: ${date}\nGET ${path} HTTP/1.1`;
  const signature = createHmac("sha256", apiSecret).update(origin).digest("base64");
  const authorizationOrigin = `api_key="${apiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signature}"`;
  const authorization = Buffer.from(authorizationOrigin, "utf8").toString("base64");
  const query = new URLSearchParams({ authorization, date, host });
  return `wss://${host}${path}?${query.toString()}`;
}

/**
 * 评测首帧（cmd=ssb）：携带公共参数与试题文本。
 * text 规则（英文 read_sentence 试题格式）：UTF-8 BOM 头 + [content] 节点 + 换行分隔。
 * 百分制三件套：rst=entirety + ise_unite=1 + extra_ability（缺省时引擎按 0-5 分制返回）。
 */
export function buildXfFirstFrame({ appId, text }: { appId: string; text: string }) {
  return {
    common: { app_id: appId },
    business: {
      sub: "ise",
      ent: "en_vip",
      category: "read_sentence",
      cmd: "ssb",
      ttp_skip: true,
      tte: "utf-8",
      aue: "raw",
      auf: "audio/L16;rate=16000",
      rst: "entirety",
      // 百分制（0-100）三件套：rst=entirety + ise_unite=1 + extra_ability；
      // 缺省时引擎按 0-5 分制返回（全部分项封顶 5.0）
      ise_unite: "1",
      extra_ability: "multi_dimension",
      text: `﻿[content]\n${text}\n`,
    },
    data: { status: 0 },
  };
}

/**
 * aue=raw 要求裸 PCM；转码产物是带 RIFF 头的 WAV，提交前剥掉头部。
 * 头长不固定（ffmpeg 会写 LIST 等附加块），必须遍历 chunk 找 data，
 * 不能假设 44 字节。
 */
export function xfAudioPayload(audioWav: Buffer): Buffer {
  if (
    audioWav.length < 12 ||
    audioWav.toString("ascii", 0, 4) !== "RIFF" ||
    audioWav.toString("ascii", 8, 12) !== "WAVE"
  ) {
    return audioWav;
  }
  let off = 12;
  while (off + 8 <= audioWav.length) {
    const id = audioWav.toString("ascii", off, off + 4);
    const size = audioWav.readUInt32LE(off + 4);
    if (id === "data") {
      return audioWav.subarray(off + 8, Math.min(off + 8 + size, audioWav.length));
    }
    off += 8 + size + (size % 2); // chunk 按偶数对齐
  }
  throw new Error("WAV 结构异常：找不到 data chunk");
}

/** 解析最终结果 XML，兼容两种形态：rst=plain 的 `<total_score value="…"/>` 与 rst=entirety 的 `total_score="…"` 属性。 */
export function parseXfFinalResult(xml: string): number {
  const ret = /<ret\s+value="([^"]+)"/.exec(xml)?.[1];
  if (ret !== undefined && ret !== "0") {
    throw new Error(`讯飞评测失败（ret=${ret}），通常是音频与试题不匹配或音频无效`);
  }
  const score =
    /<total_score\s+value="([^"]+)"/.exec(xml)?.[1] ??
    /total_score="([^"]+)"/.exec(xml)?.[1];
  if (score === undefined) {
    throw new Error("讯飞评测结果缺少 total_score");
  }
  const value = Number(score);
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new Error(`讯飞评测总分超出 0-100 范围：${score}`);
  }
  return value;
}
