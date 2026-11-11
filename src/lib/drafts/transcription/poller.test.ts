import { describe, expect, it, vi } from "vitest";
import { setupDb } from "@/lib/testing/auth-test-utils";
import type { Db } from "@/lib/db";
import { openDb } from "@/lib/db";
import { createAccount, findAccountByEmail } from "@/lib/auth/accounts";
import {
  completeTranscription,
  createDraft,
  deleteDraft,
  getDraft,
  setDraftVideo,
  setTranscribeTask,
} from "../repo";
import {
  TranscriptionPoller,
  isResumableDraft,
  nextPollDelayMs,
  pollDraftOnce,
  resumeTranscriptionPolling,
  selectResumableDrafts,
  setTranscriptionPoller,
  shouldResumePolling,
} from "./poller";
import type {
  TranscriptionPollResult,
  TranscriptionService,
  TranscriptionTask,
} from "./types";

/** 按脚本吐结果的服务：记录每次 poll，脚本用尽后重复最后一项 */
class ScriptedService implements TranscriptionService {
  calls: string[] = [];
  constructor(private readonly script: TranscriptionPollResult[]) {}

  async submit(): Promise<TranscriptionTask> {
    throw new Error("poller 测试不走 submit");
  }

  async poll(taskId: string): Promise<TranscriptionPollResult> {
    this.calls.push(taskId);
    return this.script[Math.min(this.calls.length - 1, this.script.length - 1)];
  }
}

/** 手动调度器：不真等时间，测试里逐轮泵队列驱动循环 */
function pumpScheduler() {
  const queue: Array<() => void> = [];
  return {
    setTimeoutFn: (fn: () => void) => {
      queue.push(fn);
      return queue.length;
    },
    pump: async (rounds: number) => {
      for (let i = 0; i < rounds; i++) {
        // 先落定在途链（上一轮 poll 的落库与下一轮 sleep 的登记），
        // 再跑一个到点的定时器
        await new Promise((resolve) => setTimeout(resolve, 0));
        if (queue.length === 0) break;
        const fn = queue.shift()!;
        fn();
      }
      await new Promise((resolve) => setTimeout(resolve, 0));
    },
  };
}

function setup(): Db {
  const db = setupDb("ra-poller");
  // content_drafts 外键指向 accounts，先落一个测试账号
  createAccount(db, { email: "acc1@test.com", password: "secret123" });
  return db;
}

function seedDraft(db: Db, taskId: string | null): string {
  const accountId = findAccountByEmail(db, "acc1@test.com")!.id;
  const draft = createDraft(db, { accountId, title: "t" });
  setDraftVideo(db, draft.id, `${accountId}/${draft.id}.mp4`);
  if (taskId) setTranscribeTask(db, draft.id, taskId);
  return draft.id;
}

describe("nextPollDelayMs（间隔纯函数；默认 base=max 即固定 5s，V0.4.2）", () => {
  it("默认固定 5s：不随 attempt 增长", () => {
    expect(nextPollDelayMs(1)).toBe(5000);
    expect(nextPollDelayMs(2)).toBe(5000);
    expect(nextPollDelayMs(50)).toBe(5000);
  });

  it("显式给 max 时保留指数退避算式（需要时可调回退避模式）", () => {
    expect(nextPollDelayMs(1, 5000, 60000)).toBe(5000);
    expect(nextPollDelayMs(2, 5000, 60000)).toBe(10000);
    expect(nextPollDelayMs(3, 5000, 60000)).toBe(20000);
    expect(nextPollDelayMs(9, 5000, 60000)).toBe(60000);
    expect(nextPollDelayMs(50, 5000, 60000)).toBe(60000); // 封顶后不再增长
  });
});

describe("isResumableDraft / selectResumableDrafts（重启恢复选中条件）", () => {
  it("transcribing 且有任务引用才恢复；无引用或已出转写中的不恢复", () => {
    expect(
      isResumableDraft({ status: "transcribing", transcribeTaskId: "o1" })
    ).toBe(true);
    expect(
      isResumableDraft({ status: "transcribing", transcribeTaskId: null })
    ).toBe(false);
    expect(
      isResumableDraft({ status: "proofreading", transcribeTaskId: "o1" })
    ).toBe(false);
  });

  it("selectResumableDrafts 只挑中该恢复的草稿", () => {
    const db = setup();
    const resumed = seedDraft(db, "order-1");
    seedDraft(db, null); // transcribing 无任务引用（提交失败过）
    const proofreading = seedDraft(db, "order-2");
    completeTranscription(db, proofreading, [
      { text: "Hi", startMs: 0, endMs: 100 },
    ]);
    const ids = selectResumableDrafts(db).map((d) => d.id);
    expect(ids).toEqual([resumed]);
  });
});

describe("pollDraftOnce（单次轮询的三态落库）", () => {
  it("done：句子整体落库，状态置 proofreading，循环停止", async () => {
    const db = setup();
    const id = seedDraft(db, "order-1");
    const service = new ScriptedService([
      {
        state: "done",
        sentences: [{ text: "Hello!", startMs: 0, endMs: 1000 }],
      },
    ]);
    expect(await pollDraftOnce(db, service, id)).toBe("stop");
    const draft = getDraft(db, id)!;
    expect(draft.status).toBe("proofreading");
    expect(draft.transcribeError).toBeNull();
  });

  it("failed：错误落库，草稿保持 transcribing（可重试），任务引用不丢", async () => {
    const db = setup();
    const id = seedDraft(db, "order-1");
    const service = new ScriptedService([
      { state: "failed", error: "识别失败" },
    ]);
    expect(await pollDraftOnce(db, service, id)).toBe("stop");
    const draft = getDraft(db, id)!;
    expect(draft.status).toBe("transcribing");
    expect(draft.transcribeError).toBe("识别失败");
    expect(draft.transcribeTaskId).toBe("order-1");
  });

  it("pending：继续轮询，草稿不被改动", async () => {
    const db = setup();
    const id = seedDraft(db, "order-1");
    const service = new ScriptedService([{ state: "pending" }]);
    expect(await pollDraftOnce(db, service, id)).toBe("continue");
    expect(getDraft(db, id)!.status).toBe("transcribing");
  });

  it("草稿在轮询期间被删除：直接停止，不报错", async () => {
    const db = setup();
    const id = seedDraft(db, "order-1");
    const service = new ScriptedService([{ state: "pending" }]);
    deleteDraft(db, id);
    expect(await pollDraftOnce(db, service, id)).toBe("stop");
    expect(service.calls).toHaveLength(0); // 没草稿就不打 API
  });

  it("poll 抛错（网络/服务抖动）：错误落库但继续轮询", async () => {
    const db = setup();
    const id = seedDraft(db, "order-1");
    const service = new ScriptedService([{ state: "pending" }]);
    vi.spyOn(service, "poll").mockRejectedValueOnce(new Error("HTTP 502"));
    expect(await pollDraftOnce(db, service, id)).toBe("continue");
    expect(getDraft(db, id)!.transcribeError).toContain("502");
  });
});

describe("TranscriptionPoller（后台循环）", () => {
  it("pending 几轮后 done：草稿进入 proofreading，循环退出", async () => {
    const db = setup();
    const id = seedDraft(db, "order-1");
    const service = new ScriptedService([
      { state: "pending" },
      { state: "pending" },
      {
        state: "done",
        sentences: [
          { text: "A", startMs: 0, endMs: 500 },
          { text: "B", startMs: 600, endMs: 1200 },
        ],
      },
    ]);
    const scheduler = pumpScheduler();
    const poller = new TranscriptionPoller(db, service, {
      baseDelayMs: 5000,
      setTimeoutFn: scheduler.setTimeoutFn,
    });
    poller.start(id);
    await scheduler.pump(10);
    expect(getDraft(db, id)!.status).toBe("proofreading");
    expect(service.calls).toHaveLength(3); // 每轮一次，没有重复循环
    expect(poller.polling).toEqual([]);
  });

  it("请求作用域连接已关闭：轮询自动新开连接继续，不永久卡住", async () => {
    const db = setup();
    const id = seedDraft(db, "order-1");
    const dbFile = process.env.DB_PATH!;
    db.close(); // 模拟上传请求结束后连接被关掉
    const service = new ScriptedService([
      { state: "pending" },
      {
        state: "done",
        sentences: [{ text: "A", startMs: 0, endMs: 500 }],
      },
    ]);
    const scheduler = pumpScheduler();
    const poller = new TranscriptionPoller(db, service, {
      setTimeoutFn: scheduler.setTimeoutFn,
      openDbFn: () => openDb(dbFile),
    });
    poller.start(id);
    await scheduler.pump(10);

    const check = openDb(dbFile);
    try {
      expect(getDraft(check, id)!.status).toBe("proofreading");
    } finally {
      check.close();
    }
  });

  it("确定失败：错误落库后停止轮询（重试由人触发，不空转）", async () => {
    const db = setup();
    const id = seedDraft(db, "order-1");
    const service = new ScriptedService([
      { state: "failed", error: "静音文件" },
    ]);
    const scheduler = pumpScheduler();
    const poller = new TranscriptionPoller(db, service, {
      setTimeoutFn: scheduler.setTimeoutFn,
    });
    poller.start(id);
    await scheduler.pump(10);
    expect(getDraft(db, id)!.transcribeError).toBe("静音文件");
    expect(service.calls).toHaveLength(1);
    expect(poller.polling).toEqual([]);
  });

  it("连续抛错到 maxAttempts：写明错误并停止（不无限转）", async () => {
    const db = setup();
    const id = seedDraft(db, "order-1");
    const service = new ScriptedService([{ state: "pending" }]);
    const pollSpy = vi.spyOn(service, "poll").mockRejectedValue(new Error("HTTP 500"));
    const scheduler = pumpScheduler();
    const poller = new TranscriptionPoller(db, service, {
      maxAttempts: 3,
      setTimeoutFn: scheduler.setTimeoutFn,
    });
    poller.start(id);
    await scheduler.pump(10);
    expect(pollSpy).toHaveBeenCalledTimes(3);
    expect(getDraft(db, id)!.transcribeError).toContain("3 次");
    expect(poller.polling).toEqual([]);
  });

  it("start 同一草稿两次只跑一个循环；stopAll 停止在途轮询", async () => {
    const db = setup();
    const id = seedDraft(db, "order-1");
    const service = new ScriptedService([{ state: "pending" }]);
    const scheduler = pumpScheduler();
    const poller = new TranscriptionPoller(db, service, {
      setTimeoutFn: scheduler.setTimeoutFn,
    });
    poller.start(id);
    poller.start(id);
    await scheduler.pump(2);
    expect(service.calls).toHaveLength(2); // 双倍循环会是 4 次
    poller.stopAll();
    expect(poller.polling).toEqual([]);
  });

  it("resumeAll：重启后恢复所有该恢复的草稿（不重复启动已在轮询的）", async () => {
    const db = setup();
    const id1 = seedDraft(db, "order-1");
    seedDraft(db, null);
    const scheduler = pumpScheduler();
    const service = new ScriptedService([{ state: "pending" }]);
    const poller = new TranscriptionPoller(db, service, {
      setTimeoutFn: scheduler.setTimeoutFn,
    });
    poller.resumeAll();
    expect(poller.polling).toEqual([id1]);
    poller.resumeAll(); // 二次恢复不叠加
    expect(poller.polling).toEqual([id1]);
  });

  it("resumeTranscriptionPolling 走单例：置入测试轮询器后委托给它", () => {
    const db = setup();
    const id1 = seedDraft(db, "order-1");
    const scheduler = pumpScheduler();
    const poller = new TranscriptionPoller(db, new ScriptedService([]), {
      setTimeoutFn: scheduler.setTimeoutFn,
    });
    setTranscriptionPoller(poller);
    try {
      expect(resumeTranscriptionPolling(db)).toBe(1);
      expect(poller.polling).toEqual([id1]);
    } finally {
      setTranscriptionPoller(null);
    }
  });
});

describe("shouldResumePolling（instrumentation 启动门槛，纯函数）", () => {
  const CREDS = { LFASR_APP_ID: "a", LFASR_API_KEY: "k", LFASR_API_SECRET: "s" };

  it("nodejs runtime + 非 build 阶段 + 有凭据 → 恢复", () => {
    expect(
      shouldResumePolling({ ...CREDS, NEXT_RUNTIME: "nodejs" })
    ).toBe(true);
  });

  it("edge runtime 不恢复；next build 阶段不恢复；没凭据（fake 模式）不恢复", () => {
    expect(shouldResumePolling({ ...CREDS, NEXT_RUNTIME: "edge" })).toBe(false);
    expect(
      shouldResumePolling({
        ...CREDS,
        NEXT_RUNTIME: "nodejs",
        NEXT_PHASE: "phase-production-build",
      })
    ).toBe(false);
    expect(shouldResumePolling({ NEXT_RUNTIME: "nodejs" })).toBe(false);
  });
});
