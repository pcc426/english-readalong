// 句子插入端点（V0.2.1 票 03）测试矩阵：
//   POST /api/drafts/[id]/sentences/[index]/insert
// index 句后插入新句：时间按占位规则、文本可带初始值、置 edited、返回整个数组。
// 未登录 401；他人/不存在草稿与越界序号 404；非 proofreading 409。
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

describe("POST /api/drafts/[id]/sentences/[index]/insert", () => {
  it("未登录 401", async () => {
    setupEnv("ra-insert-anon");
    const res = await POST(
      new Request("http://x/api/drafts/d/sentences/0/insert", { method: "POST" }),
      ctxOf("d", 0)
    );
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("UNAUTHORIZED");
  });

  it("本人插入：新句 seq=index+1、占位时间取空隙、置 edited、返回整个数组", async () => {
    const { db, mine } = setupEnv("ra-insert-ok");
    const id = seedProofreadingDraft(db, mine);

    const res = await POST(
      sentencesReq("POST", id, 0, { text: "Hello, Kitty!" }),
      ctxOf(id, 0)
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { sentences: Array<Record<string, unknown>> };
    expect(body.sentences).toHaveLength(4);
    expect(body.sentences[1]).toEqual({
      index: 1,
      text: "Hello, Kitty!",
      startMs: 3200, // 当前句结束
      endMs: 3400, // 下一句开始（种子里的空隙）
      proofread: "edited",
    });
    expect(rowSeqs(db, id)).toEqual([0, 1, 2, 3]);
  });

  it("缺省文本落空串；text 非字符串 400", async () => {
    const { db, mine } = setupEnv("ra-insert-body");
    const id = seedProofreadingDraft(db, mine);

    const ok = await POST(sentencesReq("POST", id, 1, {}), ctxOf(id, 1));
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as { sentences: Array<{ text: string }> };
    expect(body.sentences[2].text).toBe("");

    const bad = await POST(sentencesReq("POST", id, 1, { text: 42 }), ctxOf(id, 1));
    expect(bad.status).toBe(400);
    expect((await bad.json()).error.code).toBe("SENTENCE_INVALID");
  });

  it("越界序号 404 SENTENCE_NOT_FOUND", async () => {
    const { db, mine } = setupEnv("ra-insert-oob");
    const id = seedProofreadingDraft(db, mine);

    for (const index of ["9", "-1", "abc"]) {
      const res = await POST(sentencesReq("POST", id, index), ctxOf(id, index));
      expect(res.status).toBe(404);
      expect((await res.json()).error.code).toBe("SENTENCE_NOT_FOUND");
    }
  });

  it("非本人草稿 404 且句子原样；不存在的草稿同样 404", async () => {
    const { db, mine } = setupEnv("ra-insert-foreign");
    const id = seedProofreadingDraft(db, mine);

    const res = await POST(
      sentencesReq("POST", id, 0, {}, "other@test.com"),
      ctxOf(id, 0)
    );
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("DRAFT_NOT_FOUND");
    expect(rowSeqs(db, id)).toEqual([0, 1, 2]);

    const missing = await POST(
      sentencesReq("POST", "no-such-id", 0),
      ctxOf("no-such-id", 0)
    );
    expect(missing.status).toBe(404);
  });

  it("transcribing / published 草稿 409 DRAFT_NOT_EDITABLE", async () => {
    const { db, mine } = setupEnv("ra-insert-status");
    const transcribing = seedDraftWithStatus(db, mine, "transcribing");
    const published = seedDraftWithStatus(db, mine, "published");

    const r1 = await POST(
      sentencesReq("POST", transcribing, 0),
      ctxOf(transcribing, 0)
    );
    expect(r1.status).toBe(409);
    expect((await r1.json()).error.code).toBe("DRAFT_NOT_EDITABLE");

    const r2 = await POST(
      sentencesReq("POST", published, 0),
      ctxOf(published, 0)
    );
    expect(r2.status).toBe(409);
    expect((await r2.json()).error.code).toBe("DRAFT_NOT_EDITABLE");
    expect(rowSeqs(db, published)).toEqual([0, 1, 2]);
  });
});
