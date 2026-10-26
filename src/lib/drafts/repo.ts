import { randomUUID } from "node:crypto";
import type { Db } from "../db";
import type { TranscribedSentence } from "./transcription/types";

/** 草稿状态：transcribing → proofreading → published（定稿由 09 号票实现） */
export type DraftStatus = "transcribing" | "proofreading" | "published";

/** 句子校对状态：auto=转写产出 / edited=人工改过 / confirmed=已确认（07/08 号票） */
export type SentenceProofread = "auto" | "edited" | "confirmed";

export interface Draft {
  id: string;
  accountId: string;
  title: string;
  type: "custom" | "standard";
  status: DraftStatus;
  /** 视频相对 uploads 根的路径（<accountId>/<uuid>.<ext>） */
  videoPath: string;
  transcribeTaskId: string | null;
  transcribeError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DraftSentence {
  /** 0 起，与 practice_attempts.sentence_index 同口径 */
  index: number;
  text: string;
  startMs: number;
  endMs: number;
  proofread: SentenceProofread;
}

interface DraftRow {
  id: string;
  account_id: string;
  title: string;
  type: string;
  status: string;
  video_path: string;
  transcribe_task_id: string | null;
  transcribe_error: string | null;
  created_at: string;
  updated_at: string;
}

function toDraft(row: DraftRow): Draft {
  return {
    id: row.id,
    accountId: row.account_id,
    title: row.title,
    type: row.type as Draft["type"],
    status: row.status as DraftStatus,
    videoPath: row.video_path,
    transcribeTaskId: row.transcribe_task_id,
    transcribeError: row.transcribe_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createDraft(
  db: Db,
  input: { accountId: string; title: string }
): Draft {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO content_drafts (id, account_id, title, type, status, video_path)
     VALUES (?, ?, ?, 'custom', 'transcribing', '')`
  ).run(id, input.accountId, input.title);
  // video_path 列 NOT NULL，上传服务在建行后立刻落真实引用；
  // 先建行再写文件可以让"上传成功但转写提交失败"也有迹可循。
  return getDraft(db, id)!;
}

export function getDraft(db: Db, id: string): Draft | null {
  const row = db
    .prepare("SELECT * FROM content_drafts WHERE id = ?")
    .get(id) as DraftRow | undefined;
  return row ? toDraft(row) : null;
}

/** 本账号的草稿列表，新草稿在前（同秒内按插入序倒排）；
 * 传 type（V0.2 整改）时只返回该类型的草稿——「自定义内容」页不混入
 * 管理员的标准草稿，反之亦然。 */
export function listDraftsByAccount(
  db: Db,
  accountId: string,
  type?: Draft["type"]
): Draft[] {
  const rows = type
    ? (db
        .prepare(
          `SELECT * FROM content_drafts WHERE account_id = ? AND type = ?
           ORDER BY created_at DESC, rowid DESC`
        )
        .all(accountId, type) as DraftRow[])
    : (db
        .prepare(
          `SELECT * FROM content_drafts WHERE account_id = ?
           ORDER BY created_at DESC, rowid DESC`
        )
        .all(accountId) as DraftRow[]);
  return rows.map(toDraft);
}

export function setDraftVideo(db: Db, id: string, videoPath: string): void {
  db.prepare(
    `UPDATE content_drafts SET video_path = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(videoPath, id);
}

/** 记下转写任务引用（poll 凭它续查；06 号票的退避轮询也用它） */
export function setTranscribeTask(db: Db, id: string, taskId: string): void {
  db.prepare(
    `UPDATE content_drafts SET transcribe_task_id = ?, transcribe_error = NULL,
     updated_at = datetime('now') WHERE id = ?`
  ).run(taskId, id);
}

/** 转写失败：草稿保持 transcribing，错误落库可重试（转写缝契约） */
export function setTranscribeError(db: Db, id: string, error: string): void {
  db.prepare(
    `UPDATE content_drafts SET transcribe_error = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(error, id);
}

/** 转写完成：句子整体落入 draft_sentences，状态置 proofreading（事务） */
export function completeTranscription(
  db: Db,
  id: string,
  sentences: TranscribedSentence[]
): void {
  const insert = db.prepare(
    `INSERT INTO draft_sentences (draft_id, seq, text, start_ms, end_ms, proofread)
     VALUES (?, ?, ?, ?, ?, 'auto')`
  );
  const tx = db.transaction(() => {
    sentences.forEach((s, index) =>
      insert.run(id, index, s.text, s.startMs, s.endMs)
    );
    db.prepare(
      `UPDATE content_drafts SET status = 'proofreading', updated_at = datetime('now')
       WHERE id = ?`
    ).run(id);
  });
  tx();
}

export function listDraftSentences(db: Db, draftId: string): DraftSentence[] {
  const rows = db
    .prepare(
      `SELECT seq, text, start_ms, end_ms, proofread FROM draft_sentences
       WHERE draft_id = ? ORDER BY seq`
    )
    .all(draftId) as Array<{
    seq: number;
    text: string;
    start_ms: number;
    end_ms: number;
    proofread: string;
  }>;
  return rows.map((r) => ({
    index: r.seq,
    text: r.text,
    startMs: r.start_ms,
    endMs: r.end_ms,
    proofread: r.proofread as SentenceProofread,
  }));
}

/** 删草稿（连同句子，显式事务；better-sqlite3 默认不开外键级联） */
export function deleteDraft(db: Db, id: string): void {
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM draft_sentences WHERE draft_id = ?").run(id);
    db.prepare("DELETE FROM content_drafts WHERE id = ?").run(id);
  });
  tx();
}
