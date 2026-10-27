import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { openDb, dbPath } from "@/lib/db";
import { getAccountBySession, SESSION_COOKIE } from "@/lib/auth/sessions";
import { ownedContentDetail } from "@/lib/owned-content";
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
  // 按当前账号取内容与本人最好成绩；示范视频（标准与自定义）
  // 在这里已解析为 /api/media 鉴权地址，页面不再做静态路径处理
  const unit = ownedContentDetail(id, accountId);
  if (!unit) notFound();

  return (
    <main className="flex h-[100dvh] overflow-hidden">
      <PracticeFlow unit={unit} />
    </main>
  );
}
