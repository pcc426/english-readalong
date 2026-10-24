"use client";

// 登录后首页壳（票 03）：加载时用 /api/auth/me 鉴权，401 或无账号跳 /login。
// 这条同时接住遗留项：首页此前没有页面级未登录跳转，现由壳统一兜底。
// UI 不做自动化测试，走手工验收清单（spec · Testing Decisions）。
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Sidebar from "@/components/shell/Sidebar";
import TopNav from "@/components/shell/TopNav";
import type { Account } from "@/components/shell/types";

export default function ShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [account, setAccount] = useState<Account | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/me");
        if (cancelled) return;
        if (!res.ok) {
          router.replace("/login");
          return;
        }
        const body = (await res.json()) as { account?: Account };
        if (cancelled) return;
        if (body.account) {
          setAccount(body.account);
        } else {
          router.replace("/login");
        }
      } catch {
        // 网络异常不做登录判定，停在提示页由用户刷新重试
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!account) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center px-5">
        <p className="text-lg text-slate-400" role="status">
          {failed ? "加载失败，请刷新重试" : "加载中…"}
        </p>
      </main>
    );
  }

  return (
    <div className="flex h-[100dvh]">
      <Sidebar isAdmin={account.isAdmin} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopNav account={account} />
        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
