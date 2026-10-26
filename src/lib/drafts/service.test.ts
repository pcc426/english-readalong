import { afterEach, describe, expect, it, vi } from "vitest";
import { setupDb } from "@/lib/testing/auth-test-utils";
import type { Db } from "@/lib/db";
import { createAccount, findAccountByEmail } from "@/lib/auth/accounts";
import { createDraft, getDraft, setDraftVideo } from "./repo";
import { runTranscription } from "./service";
import { setTranscriptionService } from "./transcription/current";
import {
  TranscriptionPoller,
  setTranscriptionPoller,
} from "./transcription/poller";
import type {
  TranscriptionPollResult,
  TranscriptionService,
  TranscriptionTask,
} from "./transcription/types";

/** 脚本化假服务：submit 发任务引用，poll 按脚本吐结果 */
class ScriptedService implements TranscriptionService {
  constructor(
    private readonly taskId: string,
    private readonly script: TranscriptionPollResult[]
  ) {}

  async submit(): Promise<TranscriptionTask> {
    return { taskId: this.taskId };
  }

  async poll(): Promise<TranscriptionPollResult> {
    return this.script[0];
  }
}

const CREDS = {
  LFASR_APP_ID: "app123",
  LFASR_API_KEY: "key456",
  LFASR_API_SECRET: "sec789",
};

function setup(): Db {
  const db = setupDb("ra-svc");
  createAccount(db, { email: "acc@test.com", password: "secret123" });
  return db;
}

function seedDraft(db: Db): string {
  const accountId = findAccountByEmail(db, "acc@test.com")!.id;
  const draft = createDraft(db, { accountId, title: "t" });
  setDraftVideo(db, draft.id, `${accountId}/${draft.id}.mp4`);
  return draft.id;
}

function injectablePoller(db: Db, service: TranscriptionService) {
  const poller = new TranscriptionPoller(db, service, {
    setTimeoutFn: (_fn) => 0, // 只登记不跑：验证接线，不验证循环本体
  });
  setTranscriptionPoller(poller);
  return poller;
}

afterEach(() => {
  for (const key of Object.keys(CREDS)) delete process.env[key];
  setTranscriptionService(null);
  setTranscriptionPoller(null);
});

describe("runTranscription 的轮询接线（06 号票）", () => {
  it("配了凭据 + 首轮 pending：任务引用落库，草稿交给后台轮询循环", async () => {
    const db = setup();
    Object.assign(process.env, CREDS);
    const service = new ScriptedService("order-1", [{ state: "pending" }]);
    setTranscriptionService(service);
    const poller = injectablePoller(db, service);
    const id = seedDraft(db);

    await runTranscription(db, id);

    expect(getDraft(db, id)!.transcribeTaskId).toBe("order-1");
    expect(getDraft(db, id)!.status).toBe("transcribing");
    expect(poller.polling).toEqual([id]);
    poller.stopAll();
  });

  it("未配凭据（fake 模式）+ 首轮 pending：维持 05 现状，不起后台循环", async () => {
    const db = setup();
    const service = new ScriptedService("fake-1", [{ state: "pending" }]);
    setTranscriptionService(service);
    const poller = injectablePoller(db, service);
    const id = seedDraft(db);

    await runTranscription(db, id);

    expect(getDraft(db, id)!.transcribeTaskId).toBe("fake-1");
    expect(getDraft(db, id)!.status).toBe("transcribing");
    expect(poller.polling).toEqual([]);
  });

  it("failed：错误落库、草稿保持 transcribing，不进轮询循环", async () => {
    const db = setup();
    Object.assign(process.env, CREDS);
    const service = new ScriptedService("order-2", [
      { state: "failed", error: "识别失败" },
    ]);
    setTranscriptionService(service);
    const poller = injectablePoller(db, service);
    const id = seedDraft(db);

    await runTranscription(db, id);

    const draft = getDraft(db, id)!;
    expect(draft.status).toBe("transcribing");
    expect(draft.transcribeError).toBe("识别失败");
    expect(poller.polling).toEqual([]);
  });

  it("submit 抛错：错误落库，草稿与视频保留（可重试）", async () => {
    const db = setup();
    const service = new ScriptedService("never", [{ state: "pending" }]);
    vi.spyOn(service, "submit").mockRejectedValue(new Error("26601 非法应用信息"));
    setTranscriptionService(service);
    injectablePoller(db, service);
    const id = seedDraft(db);

    await runTranscription(db, id);

    const draft = getDraft(db, id)!;
    expect(draft.status).toBe("transcribing");
    expect(draft.transcribeError).toContain("26601");
  });
});
