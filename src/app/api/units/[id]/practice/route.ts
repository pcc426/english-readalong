import { NextResponse } from "next/server";
import { openDb, dbPath } from "@/lib/db";
import { getContent } from "@/lib/content/loader";
import { mapScoreToStars } from "@/lib/domain/stars";
import { bestAttemptsBySentence } from "@/lib/domain/stats";
import { transcodeTo16kWav } from "@/lib/scoring/transcode";
import { getScoringService } from "@/lib/scoring/current";
import { requireAccount } from "@/lib/auth/guard";
import { errorResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

// 小于这个字节数的"录音"必然无效（误触、还没开口就松手）
const MIN_AUDIO_BYTES = 100;

function isWav(buf: Buffer): boolean {
  return buf.length > 44 && buf.toString("ascii", 0, 4) === "RIFF";
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = requireAccount(req);
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;

  // 未发布门禁（票 09）：本人存在同 id 且未发布的草稿 → 拒绝练习。
  // 只查本人的草稿：他人的未发布草稿 id 不在此拦截，走下方 404 不暴露存在性；
  // 已发布草稿与标准内容（无同 id 草稿）照常放行。
  const gateDb = openDb(dbPath());
  try {
    const draftRow = gateDb
      .prepare("SELECT status FROM content_drafts WHERE id = ? AND account_id = ?")
      .get(id, auth.account.id) as { status: string } | undefined;
    if (draftRow && draftRow.status !== "published") {
      return errorResponse(409, "CONTENT_NOT_PUBLISHED", "内容还没定稿，暂时不能跟读");
    }
  } finally {
    gateDb.close();
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return errorResponse(400, "BAD_REQUEST", "请求格式不对");
  }
  const audio = form.get("audio");
  const sentenceIndex = Number(form.get("sentenceIndex"));
  // 练习 run 归属（票 04）：PracticeFlow 每轮生成一个 runId；缺省/空串按 NULL 处理，
  // 旧客户端与既有测试不填不炸。非字符串（FormData 理论上可能塞 File）同样当缺省。
  const runIdRaw = form.get("runId");
  const runId =
    typeof runIdRaw === "string" && runIdRaw.trim() !== "" ? runIdRaw : null;
  if (!(audio instanceof Blob) || audio.size < MIN_AUDIO_BYTES) {
    return errorResponse(400, "EMPTY_AUDIO", "没听清，再读一次吧");
  }
  if (!Number.isInteger(sentenceIndex) || sentenceIndex < 0) {
    return errorResponse(400, "BAD_INDEX", "句子序号不对");
  }
  const pack = getContent(id, { accountId: auth.account.id });
  const sentence = pack?.sentences[sentenceIndex];
  if (!pack || !sentence) {
    return errorResponse(404, "UNIT_NOT_FOUND", "单元或句子不存在");
  }

  // 评测服务构造失败（如缺密钥）是服务器配置问题，与"可重试的评分失败"分开
  let service: ReturnType<typeof getScoringService>;
  try {
    service = getScoringService();
  } catch (err) {
    console.error("[practice] 评测服务不可用:", (err as Error).message);
    return errorResponse(500, "SCORING_NOT_CONFIGURED", "评分服务未配置，请联系家长");
  }

  // Safari 录音是 AAC，讯飞只收 16kHz WAV（ADR-0001）；已是 WAV 的直通
  let audioBytes: Buffer = Buffer.from(await audio.arrayBuffer());
  if (!isWav(audioBytes)) {
    try {
      audioBytes = await transcodeTo16kWav(audioBytes);
    } catch (err) {
      const msg = (err as Error).message;
      console.error("[practice] 转码失败:", msg);
      const serverFault = msg.includes("启动失败");
      return errorResponse(
        serverFault ? 500 : 400,
        "TRANSCODE_FAILED",
        "录音处理失败，再试一次"
      );
    }
  }

  let score: number;
  try {
    ({ score } = await service.score({
      text: sentence.text,
      audioWav: audioBytes,
    }));
  } catch {
    return errorResponse(502, "SCORING_FAILED", "评分服务开小差了，稍等再试一次");
  }
  // 展示、落库、比较都用整数分（讯飞返回带小数）
  score = Math.round(score);

  const stars = mapScoreToStars(score);
  const db = openDb(dbPath());
  try {
    // 最好成绩按账号隔离：新纪录判定只和本人历史比（票 10）
    const prev = bestAttemptsBySentence(db, id, { owner: auth.account.id }).get(
      sentenceIndex
    )?.score ?? null;
    const isNewBest = prev === null || score > prev;
    db.prepare(
      "INSERT INTO practice_attempts (unit_id, sentence_index, score, stars, owner, run_id) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(id, sentenceIndex, score, stars, auth.account.id, runId);
    return NextResponse.json({
      score,
      stars,
      isNewBest,
      bestScore: Math.max(score, prev ?? score),
    });
  } finally {
    db.close();
  }
}
