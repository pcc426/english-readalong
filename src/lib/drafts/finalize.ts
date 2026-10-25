// 定稿（票 09）：校验草稿句子完整性 → 生成带 type/owner 的内容包写入账号目录
// → 状态置 published。先写文件后改状态：写盘失败则整体失败，不留半成品内容包，
// 草稿停在 proofreading 可重试。状态更新的辅助函数按票面要求放本模块，不动 repo.ts。
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { customContentRoot } from "@/lib/content/loader";
import type { ContentPack } from "@/lib/content/schema";
import type { Db } from "../db";
import { listDraftSentences, type Draft, type DraftSentence } from "./repo";

/** 定稿校验的逐句问题：index 为句子序号（与 practice_attempts.sentence_index 同口径）；
 * 草稿级问题（如"没有句子"）index 为 null。 */
export interface FinalizeIssue {
  index: number | null;
  problem: string;
}

/** 校验失败抛出；issues 供 API 层组装 422 响应的逐句问题清单 */
export class FinalizeValidationError extends Error {
  constructor(readonly issues: FinalizeIssue[]) {
    super(`草稿还有 ${issues.length} 处问题未解决，定稿前先处理`);
    this.name = "FinalizeValidationError";
  }
}

/** 定稿产物落点契约（10/12 号票按此读包）：<customContentRoot>/<accountId>/<packId>.json */
export function packPathFor(accountId: string, packId: string): string {
  return path.join(customContentRoot(), accountId, `${packId}.json`);
}

/** 内容包句子时间以秒为单位（内容模型 schema 约定），草稿内部按毫秒存 */
function msToSeconds(ms: number): number {
  return Math.round(ms / 100) / 10;
}

/** 定稿校验：每句有文本（非空白）且起止合法（start ≥ 0 且 end > start） */
export function validateDraftSentences(sentences: DraftSentence[]): FinalizeIssue[] {
  if (sentences.length === 0) {
    return [{ index: null, problem: "草稿还没有句子，无法定稿" }];
  }
  const issues: FinalizeIssue[] = [];
  for (const s of sentences) {
    const label = `第 ${s.index + 1} 句`;
    if (!s.text.trim()) {
      issues.push({ index: s.index, problem: `${label}缺少文本` });
    }
    if (s.startMs < 0 || s.endMs <= s.startMs) {
      issues.push({
        index: s.index,
        problem: `${label}起止时间非法（${s.startMs}–${s.endMs}ms）`,
      });
    }
  }
  return issues;
}

/** 草稿 → 内容包：id 即草稿 id；type/owner 标记自定义归属；title 取草稿标题；
 * video 沿用草稿的视频引用（<accountId>/<file>，播放端经鉴权媒体路由取流）。 */
export function buildContentPack(
  draft: Draft,
  sentences: DraftSentence[]
): ContentPack {
  return {
    id: draft.id,
    title: draft.title,
    source: "custom-upload",
    video: draft.videoPath,
    type: "custom",
    owner: draft.accountId,
    sentences: sentences.map((s) => ({
      text: s.text,
      start: msToSeconds(s.startMs),
      end: msToSeconds(s.endMs),
    })),
  };
}

/** 定稿状态落库（内容包写盘成功之后调用） */
export function markDraftPublished(db: Db, id: string): void {
  db.prepare(
    `UPDATE content_drafts SET status = 'published', updated_at = datetime('now')
     WHERE id = ?`
  ).run(id);
}

/**
 * 定稿全流程：校验 → 写内容包 → 状态置 published。
 * 校验不过抛 FinalizeValidationError（无任何副作用）；
 * 写盘失败抛原错误（状态仍是 proofreading，磁盘恢复后重试即可）。
 */
export function finalizeDraft(db: Db, draft: Draft): ContentPack {
  const sentences = listDraftSentences(db, draft.id);
  const issues = validateDraftSentences(sentences);
  if (issues.length > 0) throw new FinalizeValidationError(issues);

  const pack = buildContentPack(draft, sentences);
  const abs = packPathFor(draft.accountId, pack.id);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, JSON.stringify(pack, null, 2), "utf8");
  markDraftPublished(db, draft.id);
  return pack;
}
