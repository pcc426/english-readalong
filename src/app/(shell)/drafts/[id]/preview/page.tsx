// 预览页（V0.3 票 08）：草稿数据在服务端组装成不落盘的 ContentDetail
// （src/lib/drafts/preview.ts，换算复用 finalize），交给 PracticeFlow 的 preview
// 模式走一遍播放与逐句导航——不录音、不评分、不写内容包文件。
// 定稿发布只从本页发起（ADR 0005：UI 收敛，publish API 不改）。
// 鉴权沿用草稿路由语义（GET /api/drafts/[id]）：本人之外一律 404 不暴露存在性；
// 标准草稿只有管理员能创建，等效限管理员。仅 proofreading 可预览。
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { openDb, dbPath } from "@/lib/db";
import { getAccountBySession, SESSION_COOKIE } from "@/lib/auth/sessions";
import { getDraft, listDraftSentences } from "@/lib/drafts/repo";
import { buildPreviewDetail } from "@/lib/drafts/preview";
import PracticeFlow from "@/app/(shell)/units/[id]/PracticeFlow";

export const dynamic = "force-dynamic";

/** 服务端解析当前登录账号：未登录/会话失效跳登录页（与单元练习页同一道闸） */
async function currentAccountId(): Promise<string> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE)?.value;
  if (!sessionId) redirect("/login");
  const db = openDb(dbPath());
  try {
    const account = getAccountBySession(db, sessionId);
    if (!account) redirect("/login");
    return account.id;
  } finally {
    db.close();
  }
}

export default async function DraftPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const accountId = await currentAccountId();
  const db = openDb(dbPath());
  let unconfirmedCount: number;
  let unit;
  try {
    const draft = getDraft(db, id);
    if (!draft || draft.accountId !== accountId || draft.status !== "proofreading") {
      notFound();
    }
    const sentences = listDraftSentences(db, draft.id);
    ({ unit, unconfirmedCount } = buildPreviewDetail(draft, sentences));
  } finally {
    db.close();
  }

  return (
    <main className="flex h-full overflow-hidden">
      <PracticeFlow
        unit={unit}
        mode="preview"
        backHref={`/drafts/${id}/proofread`}
        backLabel="‹ 返回校对"
        unconfirmedCount={unconfirmedCount}
      />
    </main>
  );
}
