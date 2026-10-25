// 句子合并端点（票 07）测试矩阵：
//   POST /api/drafts/[id]/sentences/[index]/merge
// index 句与 index+1 句合并：文本拼接、起止取并集、后续序号前移、返回整个数组。
// 未登录 401；他人/不存在草稿与越界序号 404；非 proofreading 409；末句无下一句 400。
import { describe, expect, it } from "vitest";
import { POST } from "./route";
import {
  ctxOf,
  rowSeqs,
  seedDraftWithStatus,
  seedProofreadingDraft,
  sentencesReq,
  setupEnv,
} from "@/lib/testing/sentences-test-helpers";

describe("POST /api/drafts/[id]/sentences/[index]/merge", () => {
  it("未登录 401", async () => {
    setupEnv("ra-merge-anon");
    const res = await POST(new Request("http://x/api/drafts/d/sentences/0/merge", { method: "POST" }), {
      params: Promise.resolve({ id: "d", index: "0" }),
    });
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("UNAUTHORIZED");
  });

  it("本人合并 0+1：200 返回整个数组（文本拼接、时间并集、edited、序号前移）", async () => {
    const { db, mine } = setupEnv("ra-merge-ok");
    const id = seedProofreadingDraft(db, mine);

    const res = await POST(sentencesReq("POST", id, 0), ctxOf(id, 0));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      sentences: [
        {
          index: 0,
          text: "Hello! My name is Danny.",
          startMs: 0,
          endMs: 6100,
          proofread: "edited",
        },
        {
          index: 1,
          text: "What is your name?",
          startMs: 6300,
          endMs: 8900,
          proofread: "auto",
        },
      ],
    });
    expect(rowSeqs(db, id)).toEqual([0, 1]);
  });

  it("最后一句没有下一句：400 NO_NEXT_SENTENCE，句子原样", async () => {
    const { db, mine } = setupEnv("ra-merge-last");
    const id = seedProofreadingDraft(db, mine);

    const res = await POST(sentencesReq("POST", id, 2), ctxOf(id, 2));

    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("NO_NEXT_SENTENCE");
    expect(rowSeqs(db, id)).toEqual([0, 1, 2]);
  });

  it("越界序号 404 SENTENCE_NOT_FOUND", async () => {
    const { db, mine } = setupEnv("ra-merge-oob");
    const id = seedProofreadingDraft(db, mine);

    for (const index of ["9", "-1", "abc"]) {
      const res = await POST(sentencesReq("POST", id, index), ctxOf(id, index));
      expect(res.status).toBe(404);
      expect((await res.json()).error.code).toBe("SENTENCE_NOT_FOUND");
    }
  });

  it("非本人草稿 404 且句子原样；不存在的草稿同样 404", async () => {
    const { db, mine } = setupEnv("ra-merge-foreign");
    const id = seedProofreadingDraft(db, mine);

    const res = await POST(sentencesReq("POST", id, 0, undefined, "other@test.com"), ctxOf(id, 0));
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("DRAFT_NOT_FOUND");
    expect(rowSeqs(db, id)).toEqual([0, 1, 2]);

    const missing = await POST(sentencesReq("POST", "no-such-id", 0), ctxOf("no-such-id", 0));
    expect(missing.status).toBe(404);
  });

  it("transcribing / published 草稿 409 DRAFT_NOT_EDITABLE", async () => {
    const { db, mine } = setupEnv("ra-merge-status");
    const transcribing = seedDraftWithStatus(db, mine, "transcribing");
    const published = seedDraftWithStatus(db, mine, "published");

    const r1 = await POST(sentencesReq("POST", transcribing, 0), ctxOf(transcribing, 0));
    expect(r1.status).toBe(409);
    expect((await r1.json()).error.code).toBe("DRAFT_NOT_EDITABLE");

    const r2 = await POST(sentencesReq("POST", published, 0), ctxOf(published, 0));
    expect(r2.status).toBe(409);
    expect((await r2.json()).error.code).toBe("DRAFT_NOT_EDITABLE");
    expect(rowSeqs(db, published)).toEqual([0, 1, 2]);
  });
});
