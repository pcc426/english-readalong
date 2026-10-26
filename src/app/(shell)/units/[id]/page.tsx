import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { openDb, dbPath } from "@/lib/db";
import { getAccountBySession, SESSION_COOKIE } from "@/lib/auth/sessions";
import { ownedContentDetail } from "@/lib/owned-content";
import { sourceLabel } from "@/lib/content/source-label";
import PracticeFlow from "./PracticeFlow";

export const dynamic = "force-dynamic";

/** 服务端解析当前登录账号：未登录/会话失效跳登录页
 * （壳层有客户端兜底，这里是服务端数据面的同一道闸，票 10 归属接线）。 */
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

export default async function UnitPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const accountId = await currentAccountId();
  // 按当前账号取内容与本人最好成绩；自定义内容的示范视频
  // 在这里已解析为 /api/media 鉴权地址，标准内容仍是公开静态路径
  const unit = ownedContentDetail(id, accountId);
  if (!unit) notFound();

  return (
    <main className="mx-auto flex h-[100dvh] max-w-xl flex-col overflow-hidden px-5 py-2">
      <a href="/" className="text-base text-slate-500">
        ‹ 单元列表
      </a>
      <h1 className="mt-1 text-2xl font-bold">{unit.title}</h1>
      <p className="text-base text-slate-500">
        {sourceLabel(unit.source)} · {unit.sentences.length} 句
      </p>
      <PracticeFlow unit={unit} />
    </main>
  );
}
