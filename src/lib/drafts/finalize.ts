// 定稿（票 09）：校验草稿句子完整性 → 生成带 type/owner 的内容包写入账号目录
// → 状态置 published。先写文件后改状态：写盘失败则整体失败，不留半成品内容包，
// 草稿停在 proofreading 可重试。状态更新的辅助函数按票面要求放本模块，不动 repo.ts。
// 标准内容分支（票 12）：包写入运行时标准目录（data/content/standard/），
// type=standard、owner 置空（公开），source=standard-upload。
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { customContentRoot, standardRuntimeDir } from "@/lib/content/loader";
import type { ContentPack } from "@/lib/content/schema";
import { textbookPackAttribution } from "@/lib/textbook/textbook";
import type { Db } from "../db";
import { listDraftSentences, type Draft, type DraftSentence } from "./repo";
import { getDraftModule } from "./standard-drafts";

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

/** 标准内容包落点契约（12 号票）：<customContentRoot>/standard/<packId>.json
 * ——运行时目录、部署不覆盖、与账号目录平级。 */
export function standardPackPathFor(packId: string): string {
  return path.join(standardRuntimeDir(), `${packId}.json`);
}

/** 内容包句子时间以秒为单位（内容模型 schema 约定），草稿内部按毫秒存。
 * 导出共用（票 08 预览页组装同一换算），保持全站唯一的 ms→0.1s 口径。 */
export function msToSeconds(ms: number): number {
  return Math.round(ms / 100) / 10;
}

/** 定稿校验：每句有文本（非空白）、起止合法（start ≥ 0 且 end > start）、
 * 且已确认（V0.2.1：确认本句 = 文本与时点都过目，全确认才允许定稿） */
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
    if (s.proofread !== "confirmed") {
      issues.push({ index: s.index, problem: `${label}还未确认` });
    }
  }
  return issues;
}

/** 草稿 → 内容包：id 即草稿 id；title 取草稿标题；video 沿用草稿的视频引用
 * （<accountId>/<file>，播放端经鉴权媒体路由取流）。
 * custom：type/owner 标记归属；standard（12 号票）：公开内容，owner 置空。
 * 封面（票 01）：草稿抽帧成功时带 poster（两类包都写，缺失不写）。
 * 教材归属（票 03）：standard 传模块引用时反查注册表写全归属字段 + 课文名；
 * 引用缺失或查不到都显式抛错——归属静默丢失正是本票要修的 bug，不允许带病落包。 */
export function buildContentPack(
  draft: Draft,
  sentences: DraftSentence[],
  moduleRef?: { unitId: string; moduleKind: string } | null
): ContentPack {
  const standard = draft.type === "standard";
  let attribution: ReturnType<typeof textbookPackAttribution>;
  if (standard) {
    if (!moduleRef) {
      throw new Error(
        `标准草稿 ${draft.id} 缺 unit_id/module_kind，无法写教材归属（数据损坏，请检查 content_drafts 行）`
      );
    }
    attribution = textbookPackAttribution(moduleRef.unitId, moduleRef.moduleKind);
    if (!attribution) {
      throw new Error(
        `标准草稿 ${draft.id} 的教材引用（${moduleRef.unitId} / ${moduleRef.moduleKind}）在教材注册表里找不到，无法定稿`
      );
    }
  }
  return {
    id: draft.id,
    title: draft.title,
    source: standard ? "standard-upload" : "custom-upload",
    video: draft.videoPath,
    ...(draft.posterPath ? { poster: draft.posterPath } : {}),
    type: draft.type,
    owner: standard ? null : draft.accountId,
    ...(attribution ?? {}),
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

  const moduleRef = draft.type === "standard" ? getDraftModule(db, draft.id) : null;
  const pack = buildContentPack(draft, sentences, moduleRef);
  const abs =
    draft.type === "standard"
      ? standardPackPathFor(pack.id)
      : packPathFor(draft.accountId, pack.id);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, JSON.stringify(pack, null, 2), "utf8");
  markDraftPublished(db, draft.id);
  return pack;
}

/**
 * 退回校对（V0.2.4 票 04）：published → proofreading。
 * - 清空该内容**所有账号**的练习记录：句子结构可能已变，旧进度会错位，
 *   保留有害（用户明确决定清空）；
 * - 删除已发布内容包文件：内容从所有账号的列表与练习中消失，
 *   直到重新定稿（同 id 重发，练习链接不变）；
 * - 草稿句子原样保留——只为改一两句话而不用整个重新上传校对。
 * 顺序：先事务落库（记录+状态），再删文件；文件已缺失不算错。
 */
export function unpublishDraft(db: Db, draft: Draft): void {
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM practice_attempts WHERE unit_id = ?").run(draft.id);
    db.prepare(
      `UPDATE content_drafts SET status = 'proofreading', updated_at = datetime('now')
       WHERE id = ?`
    ).run(draft.id);
  });
  tx();
  const abs =
    draft.type === "standard"
      ? standardPackPathFor(draft.id)
      : packPathFor(draft.accountId, draft.id);
  rmSync(abs, { force: true });
}
