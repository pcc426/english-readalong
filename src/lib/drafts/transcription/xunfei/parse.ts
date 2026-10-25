import type { TranscribedSentence } from "../types";

/**
 * LFASR 转写结果解析（纯函数）。
 *
 * 讯飞两份文档给出的结果形态不同，解析器都收：
 * - Java SDK 归一化（Java-SDK.html）：句子数组 [{bg, ed, onebest}]；
 * - WebAPI 原始（ifasr_new/API.html）：{ lattice: ["<json_1best>", ...] } 或
 *   { data: "<字符串化的帧数组>" / [帧...] }，帧内 st{bg,ed,rt[{ws[{cw}]}]}。
 *
 * 句级文本优先 onebest / cw[].rl，退化为 cw[].w 原样拼接（不插空格，
 * 讯飞英文分词自带空格）；起止毫秒一律转 number。坏 JSON 条目、空文本、
 * 非法时间（end ≤ start 或非数字）剔除；输出保持文档顺序（帧按时间序）。
 * 真实生产形态由 scripts/smoke-lfasr.ts 实机校验。
 */
export function parseLfasrSentences(decoded: unknown): TranscribedSentence[] {
  const candidates = collectCandidates(decoded, 0);
  return collapseAndFilter(candidates);
}

/** 句候选：文本 + 字符串形式的起止毫秒（讯飞原样）；fromRl 标记 rl 形态 */
interface SentenceCandidate {
  text: string;
  bg: string;
  ed: string;
  fromRl?: boolean;
}

/**
 * 递归收集所有句候选。深度受限：root → 包络（lattice/data，data 可能
 * 字符串化两层）→ 帧 → rt → ws，最深约 8 层；上限取 10 防
 * 循环引用/恶意深度。
 */
function collectCandidates(node: unknown, depth: number): SentenceCandidate[] {
  if (depth > 10 || node == null) return [];
  // 字符串：可能是 json_1best / data 字符串化 / onebest 条目，先解 JSON
  if (typeof node === "string") {
    const parsed = tryJsonParse(node);
    return parsed === undefined ? [] : collectCandidates(parsed, depth + 1);
  }
  if (Array.isArray(node)) {
    return node.flatMap((child) => collectCandidates(child, depth + 1));
  }
  if (!isRecord(node)) return [];

  // 归一化条目：{bg, ed, onebest}
  if (
    typeof node.onebest === "string" &&
    typeof node.bg === "string" &&
    typeof node.ed === "string"
  ) {
    return [{ text: node.onebest, bg: node.bg, ed: node.ed }];
  }

  // 帧：st 是对象且带句级 bg/ed → 一帧一句，文本从 rt 里拼
  // （json_1best 里 rt 挂在 st 下；个别变体挂在帧级，一并兜住）
  const st = node.st;
  if (isRecord(st) && typeof st.bg === "string" && typeof st.ed === "string") {
    return [
      {
        text: joinFrameWords(st.rt ?? node.rt ?? node.ws),
        bg: st.bg,
        ed: st.ed,
      },
    ];
  }

  // ws 级条目：{bg, ed, cw} → 文本优先 cw[].rl（onebest），退化拼接 cw[].w
  if (
    typeof node.bg === "string" &&
    typeof node.ed === "string" &&
    Array.isArray(node.cw)
  ) {
    const text = joinWsText(node.cw);
    const fromRl = cwHasRl(node.cw);
    return text ? [{ text, bg: node.bg, ed: node.ed, fromRl }] : [];
  }

  // 包络/中间层：lattice、data、帧数组、rt/ws 数组，继续下钻
  const children = [node.lattice, node.data, node.rt, node.ws];
  return children.flatMap((child) => collectCandidates(child, depth + 1));
}

/** ws 级文本：优先第一条非空 rl（整句 onebest），否则 cw[].w 拼接 */
function joinWsText(cw: unknown[]): string {
  for (const item of cw) {
    if (isRecord(item) && typeof item.rl === "string" && item.rl.trim()) {
      return item.rl;
    }
  }
  return cw
    .map((item) => (isRecord(item) && typeof item.w === "string" ? item.w : ""))
    .join("");
}

/** 该 ws 的 cw 里是否带 rl（onebest）字段 */
function cwHasRl(cw: unknown[]): boolean {
  return cw.some(
    (item) => isRecord(item) && typeof item.rl === "string" && item.rl.trim()
  );
}

/** 帧文本：rt[{ws[{cw}]}] 里全部 w 拼接（st 形态没有 rl，词即句内容） */
function joinFrameWords(rt: unknown): string {
  const parts: string[] = [];
  visitWords(rt);
  return parts.join("");

  function visitWords(node: unknown): void {
    if (Array.isArray(node)) {
      node.forEach(visitWords);
      return;
    }
    if (!isRecord(node)) return;
    if (Array.isArray(node.cw)) {
      for (const item of node.cw) {
        if (isRecord(item) && typeof item.w === "string") parts.push(item.w);
      }
      return;
    }
    if (Array.isArray(node.ws)) visitWords(node.ws);
  }
}

/**
 * 相邻候选合并为一句再过滤为合法句。只合并 rl 逐词重复形态（同一句的
 * 相邻片段 rl 相同）——归一化形态里相邻两条相同文本是真实的重复句
 * （如 chant "Jump! Jump!"），必须保留为两句。
 */
function collapseAndFilter(
  candidates: SentenceCandidate[]
): TranscribedSentence[] {
  const merged: SentenceCandidate[] = [];
  for (const cand of candidates) {
    const prev = merged[merged.length - 1];
    if (
      prev &&
      cand.fromRl &&
      prev.fromRl &&
      prev.text === cand.text &&
      prev.text.trim()
    ) {
      prev.ed = cand.ed; // 同句的后继片段：文本不变，终点取最后一段
      continue;
    }
    merged.push({ ...cand });
  }
  const out: TranscribedSentence[] = [];
  for (const cand of merged) {
    const text = cand.text.trim();
    if (!text) continue;
    const startMs = Number(cand.bg);
    const endMs = Number(cand.ed);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) continue;
    if (endMs <= startMs || startMs < 0) continue;
    out.push({ text, startMs, endMs });
  }
  return out;
}

function tryJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
