import type { Db } from "../../db";
import { getTranscriptionService } from "./current";
import { xunfeiTranscriptionConfigured } from "./env";
import {
  completeTranscription,
  getDraft,
  setTranscribeError,
  type Draft,
} from "../repo";
import type { TranscriptionService } from "./types";

/**
 * 真实引擎的转写轮询循环与重启恢复（06 号票）。
 * - 循环体薄：pollDraftOnce 一次轮询 → 三态落库 → stop/continue；
 * - 退避调度与恢复选择拆成纯函数（nextPollDelayMs / isResumableDraft），
 *   定时器可注入，单测用队列调度器驱动，不真等时间；
 * - 只服务真实 provider：fake 模式（未配凭据）不起循环，05 现状不变。
 */

export type PollVerdict = "stop" | "continue";

/** 重启恢复的选中条件：还在转写中且已有远端任务引用 */
export function isResumableDraft(
  draft: Pick<Draft, "status" | "transcribeTaskId">
): boolean {
  return draft.status === "transcribing" && Boolean(draft.transcribeTaskId);
}

/** 退避间隔：第 attempt 次轮询前等 base * 2^(attempt-1)，封顶 max（默认 5s → 60s） */
export function nextPollDelayMs(
  attempt: number,
  baseMs = 5000,
  maxMs = 60000
): number {
  return Math.min(baseMs * 2 ** (attempt - 1), maxMs);
}

/**
 * 挑出重启后要恢复轮询的草稿。repo.ts 归 05 号票所有不做扩展，
 * 这里只用一条只读 SQL 选 id，行映射与写操作全部走 repo 既有函数。
 */
export function selectResumableDrafts(db: Db): Draft[] {
  const rows = db
    .prepare(
      `SELECT id FROM content_drafts
       WHERE status = 'transcribing'
         AND transcribe_task_id IS NOT NULL AND transcribe_task_id != ''`
    )
    .all() as Array<{ id: string }>;
  return rows
    .map((row) => getDraft(db, row.id))
    .filter((draft): draft is Draft => draft !== null && isResumableDraft(draft));
}

/**
 * 单次轮询（循环体）：
 * - done：句子整体落库、置 proofreading → 停止
 * - failed：引擎侧确定失败——错误落库、草稿保持 transcribing（可重试）→ 停止
 *   （重试由人重新触发转写，不自动空转）
 * - pending：什么都不改 → 继续
 * - 草稿被删：直接停止
 * - poll 抛错（网络/服务抖动）：错误落库可见但任务不丢 → 继续（退避后再查）
 */
export async function pollDraftOnce(
  db: Db,
  service: TranscriptionService,
  draftId: string
): Promise<PollVerdict> {
  const draft = getDraft(db, draftId);
  if (!draft?.transcribeTaskId) return "stop";
  let result;
  try {
    result = await service.poll(draft.transcribeTaskId);
  } catch (err) {
    setTranscribeError(db, draftId, (err as Error).message);
    return "continue";
  }
  if (result.state === "done") {
    completeTranscription(db, draftId, result.sentences);
    return "stop";
  }
  if (result.state === "failed") {
    setTranscribeError(db, draftId, result.error);
    return "stop";
  }
  return "continue";
}

export interface PollerOptions {
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** 轮询上限（5s→60s 退避下默认 240 次约覆盖讯飞 SLA 的 5 小时） */
  maxAttempts?: number;
  /** 定时器缝：单测注入队列调度器，生产用全局 setTimeout */
  setTimeoutFn?: (fn: () => void, ms: number) => unknown;
}

interface LoopState {
  stop: boolean;
  /** sleep 期间的唤醒器：stopAll 用来立刻退出等待 */
  wake: (() => void) | null;
}

export class TranscriptionPoller {
  private readonly loops = new Map<string, LoopState>();
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly maxAttempts: number;
  private readonly setTimeoutFn: (fn: () => void, ms: number) => unknown;

  constructor(
    private readonly db: Db,
    private readonly service: TranscriptionService,
    options: PollerOptions = {}
  ) {
    this.baseDelayMs = options.baseDelayMs ?? 5000;
    this.maxDelayMs = options.maxDelayMs ?? 60000;
    this.maxAttempts = options.maxAttempts ?? 240;
    this.setTimeoutFn = options.setTimeoutFn ?? ((fn, ms) => setTimeout(fn, ms));
  }

  /** 为一个草稿起后台轮询循环；同进程重复 start 直接忽略（防双循环） */
  start(draftId: string): void {
    if (this.loops.has(draftId)) return;
    const state: LoopState = { stop: false, wake: null };
    this.loops.set(draftId, state);
    void this.loop(draftId, state);
  }

  /** 重启恢复：把所有该恢复的草稿拉回循环，返回被恢复的草稿 */
  resumeAll(): Draft[] {
    const drafts = selectResumableDrafts(this.db);
    for (const draft of drafts) this.start(draft.id);
    return drafts;
  }

  stopAll(): void {
    for (const state of this.loops.values()) {
      state.stop = true;
      state.wake?.();
    }
    this.loops.clear();
  }

  /** 正在轮询的草稿 id（测试与可观测用） */
  get polling(): string[] {
    return [...this.loops.keys()];
  }

  private async loop(draftId: string, state: LoopState): Promise<void> {
    let attempt = 0;
    while (!state.stop) {
      attempt += 1;
      // 先等一个间隔再查：submit 后的首轮 poll 已由调用方即时做过，
      // 循环不重复立即查（attempt 1 的间隔即基础退避 5s）
      await this.sleep(
        state,
        nextPollDelayMs(attempt, this.baseDelayMs, this.maxDelayMs)
      );
      if (state.stop) break;
      if (attempt > this.maxAttempts) {
        setTranscribeError(
          this.db,
          draftId,
          `转写轮询 ${this.maxAttempts} 次仍未完成，已暂停自动轮询（可重新触发转写）`
        );
        break;
      }
      let verdict: PollVerdict;
      try {
        verdict = await pollDraftOnce(this.db, this.service, draftId);
      } catch (err) {
        setTranscribeError(this.db, draftId, (err as Error).message);
        verdict = "continue";
      }
      if (state.stop || verdict === "stop") break;
    }
    this.loops.delete(draftId);
  }

  private sleep(state: LoopState, ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
      state.wake = resolve;
      this.setTimeoutFn(() => {
        state.wake = null;
        resolve();
      }, ms);
    });
  }
}

/** 进程内单例：instrumentation 启动时建，runTranscription 往里挂新任务 */
let singleton: TranscriptionPoller | null = null;

export function getTranscriptionPoller(db?: Db): TranscriptionPoller {
  if (!singleton) {
    singleton = new TranscriptionPoller(
      db!,
      getTranscriptionService()
    );
  }
  return singleton;
}

/** 测试注入点：置入测试轮询器；传 null 恢复单例 */
export function setTranscriptionPoller(poller: TranscriptionPoller | null) {
  singleton = poller;
}

/** instrumentation 入口：恢复轮询，返回恢复数量（供启动日志） */
export function resumeTranscriptionPolling(db: Db): number {
  return getTranscriptionPoller(db).resumeAll().length;
}

/**
 * 是否该在启动时恢复轮询（纯函数，instrumentation 只做转发）：
 * 仅 nodejs runtime、非 next build 阶段、且配了真实凭据。
 * fake 模式没有远端任务可查，轮询无意义。
 */
export function shouldResumePolling(
  env: Record<string, string | undefined> = process.env
): boolean {
  return (
    env.NEXT_RUNTIME === "nodejs" &&
    env.NEXT_PHASE !== "phase-production-build" &&
    xunfeiTranscriptionConfigured(env)
  );
}
