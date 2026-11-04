// 当前登录账号（ADR-0003）：顶部导航与页面初始化用。
// v0.3.6：附带标准内容可见性（管理员恒可见；其余账号看全局开关），
// 壳层据此决定是否渲染「教材内容」入口。
import { NextResponse } from "next/server";
import { requireAccount } from "@/lib/auth/guard";
import { standardContentVisibleForAccount } from "@/lib/settings/content-visibility";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const auth = requireAccount(req);
  if (!auth.ok) return auth.response;
  const { id, email, isAdmin } = auth.account;
  return NextResponse.json({
    account: {
      id,
      email,
      isAdmin,
      standardContentVisible: standardContentVisibleForAccount(auth.account),
    },
  });
}
