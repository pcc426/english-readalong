"use client";

// 顶部导航（票 03）：右侧显示当前账号邮箱 + 退出。
// 退出 = POST /api/auth/logout（清会话 cookie）→ 跳登录页。
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Account } from "./types";

export default function TopNav({ account }: { account: Account }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleLogout() {
    if (busy) return;
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.replace("/login");
      router.refresh();
    } catch {
      // 网络异常也回登录页：本地状态已无从确认，重登最稳
      router.replace("/login");
      setBusy(false);
    }
  }

  return (
    <header className="flex items-center justify-end gap-4 border-b border-slate-100 bg-white px-6 py-3">
      <span className="truncate text-base text-slate-500">{account.email}</span>
      <button
        type="button"
        onClick={handleLogout}
        disabled={busy}
        className="shrink-0 rounded-2xl px-4 py-2 text-base font-semibold text-slate-600 ring-1 ring-slate-200 active:bg-slate-50 disabled:opacity-40"
      >
        {busy ? "退出中…" : "退出"}
      </button>
    </header>
  );
}
