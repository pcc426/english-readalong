import { randomUUID } from "node:crypto";
import type { Db } from "../db";
import { xunfeiTranscriptionConfigured } from "./transcription/env";
import { getTranscriptionPoller } from "./transcription/poller";
import { getTranscriptionService } from "./transcription/current";
import {
  completeTranscription,
  createDraft,
  getDraft,
  setDraftVideo,
  setTranscribeError,
  setTranscribeTask,
  type Draft,
} from "./repo";
import { saveUploadVideo, videoRelPath } from "./storage";

/**
 * 落盘上传视频到 <accountId>/<uuid>.<ext>，返回 uploads 根下相对路径。
 * 文件名用与草稿无关的新 UUID：草稿建行发生在时长校验之后（见 route），
 * 磁盘名不必与草稿 id 绑定。抛错由调用方决定响应（route → 500）。
 */
export async function storeUpload(
  accountId: string,
  ext: string,
  file: File
): Promise<string> {
  const relPath = videoRelPath(accountId, `${randomUUID()}.${ext}`);
  await saveUploadVideo(relPath, file);
  return relPath;
}

/**
 * 建草稿（transcribing）→ 记视频引用 → 跑转写首轮。
 * 返回最终状态的草稿：假转写即时完成后是 proofreading；
 * 真实引擎 pending/failed 时停在 transcribing，task id / 错误已落库。
 */
export async function createDraftWithTranscription(
  db: Db,
  input: { accountId: string; title: string; videoPath: string }
): Promise<Draft> {
  const draft = createDraft(db, {
    accountId: input.accountId,
    title: input.title,
  });
  setDraftVideo(db, draft.id, input.videoPath);
  await runTranscription(db, draft.id);
  return getDraft(db, draft.id)!;
}

/**
 * 转写首轮：submit 拿任务引用落库 → poll 一次。
 * - done：句子整体落 draft_sentences，状态置 proofreading
 * - failed：草稿保持 transcribing，错误信息落库（可重试）
 * - pending：保持 transcribing + 任务引用；真实引擎（env 配了 LFASR 凭据）
 *   时交给后台退避轮询循环（06 号票），fake 模式维持 05 现状不起循环
 * - 提交/轮询本身抛错：同样只记错误，草稿保留——上传已成功，不该 500 掉
 */
export async function runTranscription(db: Db, draftId: string): Promise<void> {
  const draft = getDraft(db, draftId);
  if (!draft) return;
  try {
    const { taskId } = await getTranscriptionService().submit({
      videoPath: draft.videoPath,
    });
    setTranscribeTask(db, draftId, taskId);
    const result = await getTranscriptionService().poll(taskId);
    if (result.state === "done") {
      completeTranscription(db, draftId, result.sentences);
    } else if (result.state === "failed") {
      setTranscribeError(db, draftId, result.error);
    } else if (result.state === "pending" && xunfeiTranscriptionConfigured()) {
      getTranscriptionPoller(db).start(draftId);
    }
  } catch (err) {
    setTranscribeError(db, draftId, (err as Error).message);
  }
}
