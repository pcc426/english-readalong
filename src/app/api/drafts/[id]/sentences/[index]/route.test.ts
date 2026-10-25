// 单句变更端点（票 07）权限与行为矩阵：
//   PUT    /api/drafts/[id]/sentences/[index]  更新 text / startMs / endMs / confirm
//   DELETE /api/drafts/[id]/sentences/[index]  删除该句（至少保留一句）
// 未登录 401；他人/不存在草稿与越界序号 404；非 proofreading 409；非法值 400。
import { describe, expect, it } from "vitest";
import { DELETE, PUT } from "./route";
import { openDb } from "@/lib/db";
import {
  rowSeqs,
  seedDraftWithStatus,
  seedProofreadingDraft,
  sentencesReq,
  setupEnv,
} from "@/lib/testing/sentences-test-helpers";

describe("PUT /api/drafts/[id]/sentences/[index]", () => {
  it("未登录 401", async () => {
    setupEnv("ra-put-anon");
    const res = await PUT(new Request("http://x/api/drafts/d/sentences/0"), {
      params: Promise.resolve({ id: "d", index: "0" }),
    });
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("UNAUTHORIZED");
  });

  it("本人改文本：200 返回更新后的句子（edited），库中已更新", async () => {
    const { db, mine } = setupEnv("ra-put-text");
    const id = seedProofreadingDraft(db, mine);

    const res = await PUT(sentencesReq("PUT", id, 1, { text: "改过的句子" }), {
      params: Promise.resolve({ id, index: "1" }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      sentence: {
        index: 1,
        text: "改过的句子",
        startMs: 3400,
        endMs: 6100,
        proofread: "edited",
      },
    });
    const after = openDb(process.env.DB_PATH!);
    const row = after
      .prepare("SELECT text, proofread FROM draft_sentences WHERE draft_id = ? AND seq = 1")
      .get(id) as { text: string; proofread: string };
    after.close();
    expect(row).toEqual({ text: "改过的句子", proofread: "edited" });
  });

  it("confirm:true → 200 且校对状态置 confirmed", async () => {
    const { db, mine } = setupEnv("ra-put-confirm");
    const id = seedProofreadingDraft(db, mine);

    const res = await PUT(
      sentencesReq("PUT", id, 0, { text: "Hello!", confirm: true }),
      { params: Promise.resolve({ id, index: "0" }) }
    );

    expect(res.status).toBe(200);
    expect((await res.json()).sentence.proofread).toBe("confirmed");
  });

  it("只改起止时间：200，手工改动置 edited（08 号票切点工具同缝）", async () => {
    const { db, mine } = setupEnv("ra-put-time");
    const id = seedProofreadingDraft(db, mine);

    const res = await PUT(
      sentencesReq("PUT", id, 0, { startMs: 100, endMs: 3000 }),
      { params: Promise.resolve({ id, index: "0" }) }
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      sentence: {
        index: 0,
        text: "Hello!",
        startMs: 100,
        endMs: 3000,
        proofread: "edited",
      },
    });
  });

  it("越界序号（越上界 / 负数 / 非数字）一律 404 SENTENCE_NOT_FOUND", async () => {
    const { db, mine } = setupEnv("ra-put-oob");
    const id = seedProofreadingDraft(db, mine);

    for (const index of ["3", "-1", "abc"]) {
      const res = await PUT(sentencesReq("PUT", id, index, { text: "x" }), {
        params: Promise.resolve({ id, index }),
      });
      expect(res.status).toBe(404);
      expect((await res.json()).error.code).toBe("SENTENCE_NOT_FOUND");
    }
  });

  it("非本人草稿 404 DRAFT_NOT_FOUND，句子原样；不存在的草稿同样 404", async () => {
    const { db, mine } = setupEnv("ra-put-foreign");
    const id = seedProofreadingDraft(db, mine);

    const res = await PUT(
      sentencesReq("PUT", id, 0, { text: "偷改" }, "other@test.com"),
      { params: Promise.resolve({ id, index: "0" }) }
    );
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("DRAFT_NOT_FOUND");
    expect(rowSeqs(db, id)).toEqual([0, 1, 2]);
    expect(
      (db.prepare("SELECT text FROM draft_sentences WHERE seq = 0").get() as { text: string }).text
    ).toBe("Hello!");

    const missing = await PUT(
      sentencesReq("PUT", "no-such-id", 0, { text: "x" }),
      { params: Promise.resolve({ id: "no-such-id", index: "0" }) }
    );
    expect(missing.status).toBe(404);
  });

  it("transcribing 与 published 草稿都 409 DRAFT_NOT_EDITABLE，句子不动", async () => {
    const { db, mine } = setupEnv("ra-put-status");
    const transcribing = seedDraftWithStatus(db, mine, "transcribing");
    const published = seedDraftWithStatus(db, mine, "published");

    const r1 = await PUT(
      sentencesReq("PUT", transcribing, 0, { text: "x" }),
      { params: Promise.resolve({ id: transcribing, index: "0" }) }
    );
    expect(r1.status).toBe(409);
    expect((await r1.json()).error.code).toBe("DRAFT_NOT_EDITABLE");

    const r2 = await PUT(sentencesReq("PUT", published, 0, { text: "x" }), {
      params: Promise.resolve({ id: published, index: "0" }),
    });
    expect(r2.status).toBe(409);
    expect((await r2.json()).error.code).toBe("DRAFT_NOT_EDITABLE");
    expect(rowSeqs(db, published)).toEqual([0, 1, 2]);
  });

  it("非法值 400 SENTENCE_INVALID：空文本 / 负数时间 / endMs<=startMs / 无字段 / 非法 JSON", async () => {
    const { db, mine } = setupEnv("ra-put-invalid");
    const id = seedProofreadingDraft(db, mine);

    const badBodies = [
      { text: "" },
      { text: "   " },
      { startMs: -1 },
      { endMs: 0 },
      { startMs: 5000, endMs: 5000 },
      {},
      null,
    ];
    for (const body of badBodies) {
      const res = await PUT(sentencesReq("PUT", id, 0, body), {
        params: Promise.resolve({ id, index: "0" }),
      });
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe("SENTENCE_INVALID");
    }

    const broken = new Request(`http://x/api/drafts/${id}/sentences/0`, {
      method: "PUT",
      headers: {
        cookie: sentencesReq("GET", id, 0).headers.get("cookie")!,
        "content-type": "application/json",
      },
      body: "{oops",
    });
    const res = await PUT(broken, {
      params: Promise.resolve({ id, index: "0" }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("SENTENCE_INVALID");
    expect(rowSeqs(db, id)).toEqual([0, 1, 2]);
  });
});

describe("DELETE /api/drafts/[id]/sentences/[index]", () => {
  it("未登录 401", async () => {
    setupEnv("ra-del-anon");
    const res = await DELETE(new Request("http://x/api/drafts/d/sentences/0", { method: "DELETE" }), {
      params: Promise.resolve({ id: "d", index: "0" }),
    });
    expect(res.status).toBe(401);
  });

  it("本人删中间句：200 返回整个 sentences 数组，后续序号前移且库中无空洞", async () => {
    const { db, mine } = setupEnv("ra-del-mid");
    const id = seedProofreadingDraft(db, mine);

    const res = await DELETE(sentencesReq("DELETE", id, 1), {
      params: Promise.resolve({ id, index: "1" }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      sentences: [
        { index: 0, text: "Hello!", startMs: 0, endMs: 3200, proofread: "auto" },
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

  it("仅剩一句时 400 LAST_SENTENCE，句子保留", async () => {
    const { db, mine } = setupEnv("ra-del-last");
    const id = seedProofreadingDraft(db, mine);
    db.prepare("DELETE FROM draft_sentences WHERE draft_id = ? AND seq > 0").run(id);

    const res = await DELETE(sentencesReq("DELETE", id, 0), {
      params: Promise.resolve({ id, index: "0" }),
    });

    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("LAST_SENTENCE");
    expect(rowSeqs(db, id)).toEqual([0]);
  });

  it("越界序号 404；非本人草稿 404 且句子原样", async () => {
    const { db, mine } = setupEnv("ra-del-guard");
    const id = seedProofreadingDraft(db, mine);

    const oob = await DELETE(sentencesReq("DELETE", id, 9), {
      params: Promise.resolve({ id, index: "9" }),
    });
    expect(oob.status).toBe(404);
    expect((await oob.json()).error.code).toBe("SENTENCE_NOT_FOUND");

    const foreign = await DELETE(sentencesReq("DELETE", id, 0, undefined, "other@test.com"), {
      params: Promise.resolve({ id, index: "0" }),
    });
    expect(foreign.status).toBe(404);
    expect((await foreign.json()).error.code).toBe("DRAFT_NOT_FOUND");
    expect(rowSeqs(db, id)).toEqual([0, 1, 2]);
  });

  it("transcribing / published 草稿 409 DRAFT_NOT_EDITABLE；不存在草稿 404", async () => {
    const { db, mine } = setupEnv("ra-del-status");
    const transcribing = seedDraftWithStatus(db, mine, "transcribing");
    const published = seedDraftWithStatus(db, mine, "published");

    const r1 = await DELETE(sentencesReq("DELETE", transcribing, 0), {
      params: Promise.resolve({ id: transcribing, index: "0" }),
    });
    expect(r1.status).toBe(409);
    expect((await r1.json()).error.code).toBe("DRAFT_NOT_EDITABLE");

    const r2 = await DELETE(sentencesReq("DELETE", published, 0), {
      params: Promise.resolve({ id: published, index: "0" }),
    });
    expect(r2.status).toBe(409);
    expect(rowSeqs(db, published)).toEqual([0, 1, 2]);

    const missing = await DELETE(sentencesReq("DELETE", "no-such-id", 0), {
      params: Promise.resolve({ id: "no-such-id", index: "0" }),
    });
    expect(missing.status).toBe(404);
  });
});
