import { dbPath, openDb, type Db } from "../../db";
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

/**
 * 轮询间隔（V0.4.2 验收反馈）：默认固定 5s（base = max），转写完成的状态感知
 * 延迟不超过约 5s + 前端刷新 3s。函数本身保留退避算式——调小 maxAttempts
 * 或调大 maxDelayMs 即回到退避模式，也便于单测注入。
 */
export function nextPollDelayMs(
  attempt: number,
  baseMs = 5000,
  maxMs = 5000
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
  // pending：转写仍在进行。若上一轮是网络抖动留下的临时错误，这里清掉，
  // 避免列表卡片一直挂着「转写失败」红标（V0.4.2：失败徽标按 transcribeError 显示）
  if (draft.transcribeError) {
    setTranscribeError(db, draftId, "");
  }
  return "continue";
}

export interface PollerOptions {
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** 轮询上限（V0.4.2：5s 固定间隔下默认 3600 次，约覆盖讯飞 SLA 的 5 小时） */
  maxAttempts?: number;
  /** 定时器缝：单测注入队列调度器，生产用全局 setTimeout */
  setTimeoutFn?: (fn: () => void, ms: number) => unknown;
  /** 连接已关闭时的重开方式（默认 openDb(dbPath())；测试注入临时库） */
  openDbFn?: () => Db;
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
  private readonly openDbFn: () => Db;

  constructor(
    private readonly db: Db,
    private readonly service: TranscriptionService,
    options: PollerOptions = {}
  ) {
    this.baseDelayMs = options.baseDelayMs ?? 5000;
    this.maxDelayMs = options.maxDelayMs ?? 5000;
    this.maxAttempts = options.maxAttempts ?? 3600;
    this.setTimeoutFn = options.setTimeoutFn ?? ((fn, ms) => setTimeout(fn, ms));
    this.openDbFn = options.openDbFn ?? (() => openDb(dbPath()));
  }

  /**
   * 轮询是异步后台任务，而上传请求作用域的连接会在响应结束时关闭。
   * 原连接已关闭时新开一个（每次操作后释放），避免 "database connection
   * is not open" 让轮询永久卡住。
   */
  private acquire(): { db: Db; release: () => void } {
    if (this.db.open) return { db: this.db, release: () => {} };
    const db = this.openDbFn();
    return { db, release: () => db.close() };
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
    const { db, release } = this.acquire();
    try {
      const drafts = selectResumableDrafts(db);
      for (const draft of drafts) this.start(draft.id);
      return drafts;
    } finally {
      release();
    }
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
      const { db, release } = this.acquire();
      try {
        if (attempt > this.maxAttempts) {
          setTranscribeError(
            db,
            draftId,
            `转写轮询 ${this.maxAttempts} 次仍未完成，已暂停自动轮询（可重新触发转写）`
          );
          break;
        }
        let verdict: PollVerdict;
        try {
          verdict = await pollDraftOnce(db, this.service, draftId);
        } catch (err) {
          setTranscribeError(db, draftId, (err as Error).message);
          verdict = "continue";
        }
        if (state.stop || verdict === "stop") break;
      } finally {
        release();
      }
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
