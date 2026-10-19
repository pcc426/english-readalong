import { describe, it, expect } from "vitest";
import {
  buildXfAuthUrl,
  buildXfFirstFrame,
  parseXfFinalResult,
  xfAudioPayload,
} from "./params";

// 官方文档给出的完整测试向量（独立事实来源，非同义反复）：
// https://www.xfyun.cn/doc/Ise/IseAPI.html 鉴权方法一节
const DOC = {
  apiKey: "keyxxxxxxxx8ee279348519exxxxxxxx",
  apiSecret: "secretxxxxxxxx2df7900c09xxxxxxxx",
  date: "Wed, 10 Jul 2019 07:35:43 GMT",
  signature: "WC1tTz2DI+A8nKPNhz7t7lIhG1VBKDhD3K+R3KkCHOs=",
  authorization:
    "YXBpX2tleT0ia2V5eHh4eHh4eHg4ZWUyNzkzNDg1MTlleHh4eHh4eHgiLCBhbGdvcml0aG09ImhtYWMtc2hhMjU2IiwgaGVhZGVycz0iaG9zdCBkYXRlIHJlcXVlc3QtbGluZSIsIHNpZ25hdHVyZT0iV0MxdFR6MkRJK0E4bktQTmh6N3Q3bEloRzFWQktEaEQzSytSM0trQ0hPcz0i",
};

describe("讯飞鉴权（官方文档向量）", () => {
  it("authUrl 的三个查询参数与官方示例一致", () => {
    const url = buildXfAuthUrl(
      "ise-api.xfyun.cn",
      "/v2/open-ise",
      DOC.apiKey,
      DOC.apiSecret,
      DOC.date
    );
    expect(url.startsWith("wss://ise-api.xfyun.cn/v2/open-ise?")).toBe(true);
    const parsed = new URL(url);
    expect(parsed.searchParams.get("host")).toBe("ise-api.xfyun.cn");
    expect(parsed.searchParams.get("date")).toBe(DOC.date);
    expect(parsed.searchParams.get("authorization")).toBe(DOC.authorization);
  });
});

describe("讯飞首帧构造", () => {
  it("英文句子朗读参数齐全，text 带 BOM 与 [content] 包裹", () => {
    const frame = buildXfFirstFrame({
      appId: "app123",
      text: "Minmin, listen to the music and follow it.",
    });
    expect(frame.common).toEqual({ app_id: "app123" });
    expect(frame.business).toMatchObject({
      sub: "ise",
      ent: "en_vip",
      category: "read_sentence",
      cmd: "ssb",
      ttp_skip: true,
      tte: "utf-8",
      aue: "raw",
      auf: "audio/L16;rate=16000",
      rst: "entirety",
      ise_unite: "1",
      extra_ability: "multi_dimension",
    });
    expect(frame.business.text.startsWith("﻿[content]\n")).toBe(true);
    expect(frame.business.text).toContain(
      "Minmin, listen to the music and follow it."
    );
    expect(frame.business.text.endsWith("\n")).toBe(true);
    expect(frame.data).toEqual({ status: 0 });
  });
});

describe("讯飞结果解析", () => {
  it("解析官方文档的 plain 结果 XML", () => {
    const xml =
      '<?xml version="1.0" ?><FinalResult><ret value="0"/><total_score value="98.507320"/></FinalResult>';
    expect(parseXfFinalResult(xml)).toBeCloseTo(98.50732, 4);
  });

  it("解析 entirety 形态（total_score 为属性）", () => {
    const xml =
      '<xml_result><read_sentence category="read_sentence" accuracy_score="88.5" fluency_score="90.0" standard_score="85.0" integrity_score="100" total_score="88.60"/></xml_result>';
    expect(parseXfFinalResult(xml)).toBeCloseTo(88.6, 4);
  });

  it("ret 不为 0 时报错（评测失败，如空音频）", () => {
    const xml =
      '<?xml version="1.0" ?><FinalResult><ret value="4"/><total_score value="0"/></FinalResult>';
    expect(() => parseXfFinalResult(xml)).toThrow(/评测失败/);
  });

  it("缺少 total_score 时报错", () => {
    expect(() => parseXfFinalResult("<FinalResult></FinalResult>")).toThrow();
  });
});

describe("WAV 头剥离", () => {
  function makeWav(chunksBeforeData: Array<[string, Buffer]>, pcm: Buffer): Buffer {
    const parts: Buffer[] = [
      Buffer.from("RIFF"),
      // 占位，最后回填
      Buffer.alloc(4),
      Buffer.from("WAVE"),
    ];
    for (const [id, body] of chunksBeforeData) {
      parts.push(Buffer.from(id), (() => { const b = Buffer.alloc(4); b.writeUInt32LE(body.length); return b; })(), body, body.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0));
    }
    parts.push(Buffer.from("data"), (() => { const b = Buffer.alloc(4); b.writeUInt32LE(pcm.length); return b; })(), pcm);
    const riff = Buffer.concat(parts);
    riff.writeUInt32LE(riff.length - 8, 4);
    return riff;
  }

  it("跳过附加 chunk 找到 data（ffmpeg 会写 78 字节头）", () => {
    const pcm = Buffer.from([1, 2, 3, 4]);
    const wav = makeWav([["LIST", Buffer.from("INFOhello")]], pcm);
    const payload = xfAudioPayload(wav);
    expect(payload.length).toBe(4);
    expect(payload.equals(pcm)).toBe(true);
  });

  it("标准 44 字节头同样正确剥离", () => {
    const pcm = Buffer.from([9, 8, 7, 6]);
    const wav = makeWav([], pcm);
    expect(xfAudioPayload(wav).equals(pcm)).toBe(true);
  });

  it("非 WAV 原样返回", () => {
    const raw = Buffer.from([1, 2, 3]);
    expect(xfAudioPayload(raw).equals(raw)).toBe(true);
  });
});
