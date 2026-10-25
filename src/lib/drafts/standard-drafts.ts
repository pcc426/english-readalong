// 标准内容草稿（12 号票）的专属访问函数。
// 票面文件所有权：repo.ts/service.ts 不动（06 号票并行在改转写适配器），
// unit_id/module_kind 的读写与标准草稿的建行收敛在本模块。
import { randomUUID } from "node:crypto";
import type { Db } from "../db";
import { getDraft, setDraftVideo, type Draft } from "./repo";
import { runTranscription } from "./service";

/** 草稿指向的教材单元与栏目（如 五上-U2 / Story time） */
export interface DraftModuleRef {
  unitId: string;
  moduleKind: string;
}

/**
 * 建标准草稿（type 恒为 'standard'，带 unit/module，transcribing）。
 * 不复用 repo.createDraft 再 UPDATE type：单条 INSERT 落库，
 * 不产生 type 与 unit/module 不一致的中间态行（repo.ts 保持不动）。
 * video_path 列 NOT NULL，上传服务在建行后立刻落真实引用（与 repo.createDraft 同约定）。
 */
export function createStandardDraft(
  db: Db,
  input: { accountId: string; title: string } & DraftModuleRef
): Draft {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO content_drafts (id, account_id, title, type, status, video_path, unit_id, module_kind)
     VALUES (?, ?, ?, 'standard', 'transcribing', '', ?, ?)`
  ).run(id, input.accountId, input.title, input.unitId, input.moduleKind);
  return getDraft(db, id)!;
}

/** 草稿的教材单元/栏目引用；custom 草稿（列为 NULL）或草稿不存在返回 null */
export function getDraftModule(db: Db, draftId: string): DraftModuleRef | null {
  const row = db
    .prepare("SELECT unit_id, module_kind FROM content_drafts WHERE id = ?")
    .get(draftId) as
    | { unit_id: string | null; module_kind: string | null }
    | undefined;
  if (!row || row.unit_id == null || row.module_kind == null) return null;
  return { unitId: row.unit_id, moduleKind: row.module_kind };
}

/** 一批草稿的教材引用映射（草稿列表接口用，一次查询）；
 * 只含该账号、带 unit/module 引用的草稿（custom 草稿不出现）。 */
export function draftModuleMapByAccount(
  db: Db,
  accountId: string
): Map<string, DraftModuleRef> {
  const rows = db
    .prepare(
      `SELECT id, unit_id, module_kind FROM content_drafts
       WHERE account_id = ? AND unit_id IS NOT NULL AND module_kind IS NOT NULL`
    )
    .all(accountId) as Array<{
    id: string;
    unit_id: string;
    module_kind: string;
  }>;
  return new Map(
    rows.map((r) => [r.id, { unitId: r.unit_id, moduleKind: r.module_kind }])
  );
}

/**
 * 标准版上传链路（与 service.createDraftWithTranscription 同节奏，只是建标准行）：
 * 建草稿（transcribing）→ 记视频引用 → 转写首轮（ASR 结果仅作对照，
 * 教材原文预填在 12 号票的校对页 UI 层做，不经转写路径）。
 */
export async function createStandardDraftWithTranscription(
  db: Db,
  input: { accountId: string; title: string; videoPath: string } & DraftModuleRef
): Promise<Draft> {
  const draft = createStandardDraft(db, {
    accountId: input.accountId,
    title: input.title,
    unitId: input.unitId,
    moduleKind: input.moduleKind,
  });
  setDraftVideo(db, draft.id, input.videoPath);
  await runTranscription(db, draft.id);
  return getDraft(db, draft.id)!;
}
