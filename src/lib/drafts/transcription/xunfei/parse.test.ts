import { describe, expect, it } from "vitest";
import { parseLfasrSentences } from "./parse";

/**
 * LFASR 转写结果解析。讯飞两份文档给出的形态不同：
 * - WebAPI 原始结果（ifasr_new/API.html）：orderResult 解 base64 后是
 *   { type, orderInfo, lattice: ["<json_1best 字符串>", ...] }，每个
 *   json_1best 里 st{bg,ed(毫秒字符串),rt[{ws[{cw[{w}]}]}]}；
 *   另有 data 包络（字符串再包一层数组）的同构变体。
 * - Java SDK 归一化结果（Java-SDK.html）：句子数组 [{bg, ed, onebest}]。
 * 解析器两种都收：句级文本优先 onebest/rl，退化为 cw[].w 拼接；
 * 起止毫秒一律转 number。生产真实形态由 scripts/smoke-lfasr.ts 实机校验。
 */
describe("parseLfasrSentences", () => {
  it("Java SDK 归一化形态：bg/ed/onebest 直接映射", () => {
    const decoded = [
      { bg: "0", ed: "3200", onebest: "Hello, Kitty!", speaker: 0 },
      { bg: "3400", ed: "6100", onebest: "What is your name?", speaker: 0 },
    ];
    expect(parseLfasrSentences(decoded)).toEqual([
      { text: "Hello, Kitty!", startMs: 0, endMs: 3200 },
      { text: "What is your name?", startMs: 3400, endMs: 6100 },
    ]);
  });

  it("WebAPI lattice 形态：json_1best 字符串 → st.bg/st.ed + cw[].w 拼接", () => {
    const json1best = JSON.stringify({
      st: {
        bg: "1080",
        ed: "2340",
        rt: [
          {
            ws: [
              { cw: [{ w: "What", wp: "n" }, { w: " is", wp: "n" }] },
              { cw: [{ w: " your", wp: "n" }, { w: " name?", wp: "p" }] },
            ],
          },
        ],
      },
      type: "0",
    });
    const decoded = { type: "0", lattice: [json1best] };
    expect(parseLfasrSentences(decoded)).toEqual([
      { text: "What is your name?", startMs: 1080, endMs: 2340 },
    ]);
  });

  it("WebAPI data 包络（字符串再包数组）：同构解析", () => {
    const frame = JSON.stringify({
      st: 1,
      la: "en",
      rt: [{ ws: [{ bg: "0", ed: "920", cw: [{ w: "Hello!", wp: "p" }] }] }],
    });
    // data 可能是「字符串化的数组」（两层编码）也可能直接是数组
    expect(parseLfasrSentences({ data: JSON.stringify([frame]) })).toEqual([
      { text: "Hello!", startMs: 0, endMs: 920 },
    ]);
    expect(parseLfasrSentences({ data: [frame] })).toEqual([
      { text: "Hello!", startMs: 0, endMs: 920 },
    ]);
  });

  it("ws 级 rl（onebest）逐词重复：同句合并为一句，取首 bg 尾 ed", () => {
    const frame = {
      rt: [
        {
          ws: [
            { bg: "0", ed: "1080", cw: [{ w: "Hello,", rl: "Hello, Kitty!" }] },
            { bg: "1110", ed: "2340", cw: [{ w: " Kitty.", rl: "Hello, Kitty!" }] },
          ],
        },
      ],
    };
    expect(parseLfasrSentences({ data: [frame] })).toEqual([
      { text: "Hello, Kitty!", startMs: 0, endMs: 2340 },
    ]);
  });

  it("rl 不同的相邻 ws 不合并（真正句边界）", () => {
    const frame = {
      rt: [
        {
          ws: [
            { bg: "0", ed: "1080", cw: [{ w: "Hi.", rl: "Hi." }] },
            { bg: "1200", ed: "2340", cw: [{ w: "Bye.", rl: "Bye." }] },
          ],
        },
      ],
    };
    expect(parseLfasrSentences({ data: [frame] })).toEqual([
      { text: "Hi.", startMs: 0, endMs: 1080 },
      { text: "Bye.", startMs: 1200, endMs: 2340 },
    ]);
  });

  it("容忍坏数据：坏 JSON 条目跳过、空文本/非法时间剔除、root 为空返回 []", () => {
    expect(parseLfasrSentences(null)).toEqual([]);
    expect(parseLfasrSentences({})).toEqual([]);
    expect(parseLfasrSentences([])).toEqual([]);
    const good = JSON.stringify({
      st: { bg: "100", ed: "500", rt: [{ ws: [{ cw: [{ w: "Hi" }] }] }] },
    });
    expect(
      parseLfasrSentences({ lattice: ["{not json", good, "null"] })
    ).toEqual([{ text: "Hi", startMs: 100, endMs: 500 }]);
    // 空文本、end <= start、非数字时间都不要
    expect(
      parseLfasrSentences([
        { bg: "0", ed: "0", onebest: "  " },
        { bg: "500", ed: "100", onebest: "倒退" },
        { bg: "x", ed: "900", onebest: "NaN" },
      ])
    ).toEqual([]);
  });

  it("结果按文档顺序输出（讯飞帧本身按时间序）", () => {
    const decoded = [
      { bg: "3400", ed: "6100", onebest: "B" },
      { bg: "0", ed: "3200", onebest: "A" },
    ];
    expect(parseLfasrSentences(decoded).map((s) => s.text)).toEqual(["B", "A"]);
  });

  it("真实 lattice 形态：条目是 {json_1best: '<字符串化的帧>'}", () => {
    const frame = (bg: string, ed: string, words: string[]) =>
      JSON.stringify({
        st: {
          bg,
          ed,
          rt: [{ ws: words.map((w) => ({ cw: [{ w }] })) }],
        },
      });
    const decoded = {
      lattice: [
        { json_1best: frame("880", "1680", ["Hello", " there"]) },
        { json_1best: frame("2390", "3640", ["How are you?"]) },
      ],
    };
    expect(parseLfasrSentences(decoded)).toEqual([
      { text: "Hello there", startMs: 880, endMs: 1680 },
      { text: "How are you?", startMs: 2390, endMs: 3640 },
    ]);
  });

  it("V0.3.3 一帧多句：按词级 wb/we + 句末标点重切成多句", () => {
    const frame = {
      st: {
        bg: "1000",
        ed: "5000",
        rt: [
          {
            ws: [
              { wb: 0, we: 50, cw: [{ w: " Hello", wp: "n" }] },
              { wb: 50, we: 120, cw: [{ w: " there.", wp: "p" }] },
              { wb: 200, we: 260, cw: [{ w: " How", wp: "n" }] },
              { wb: 260, we: 400, cw: [{ w: " are you?", wp: "p" }] },
            ],
          },
        ],
      },
    };
    expect(parseLfasrSentences({ data: [frame] })).toEqual([
      { text: "Hello there.", startMs: 1000, endMs: 2200 },
      { text: "How are you?", startMs: 3000, endMs: 5000 },
    ]);
  });

  it("V0.3.3 无标点时按停顿阈值切开，阈值可传参", () => {
    const frame = {
      st: {
        bg: "0",
        ed: "4000",
        rt: [
          {
            ws: [
              { wb: 0, we: 40, cw: [{ w: " Hello", wp: "n" }] },
              { wb: 40, we: 100, cw: [{ w: " everyone", wp: "n" }] },
              { wb: 200, we: 240, cw: [{ w: " let's", wp: "n" }] },
              { wb: 240, we: 300, cw: [{ w: " start", wp: "n" }] },
            ],
          },
        ],
      },
    };
    // 词间静默 1000ms（100→200 帧）
    expect(parseLfasrSentences({ data: [frame] })).toHaveLength(2);
    expect(
      parseLfasrSentences({ data: [frame] }, { pauseMs: 5000 })
    ).toHaveLength(1);
  });
});
