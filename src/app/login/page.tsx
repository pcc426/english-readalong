"use client";

// 极简登录页（票 01）：邮箱 + 密码 → POST /api/auth/login → 成功跳首页。
// UI 不做自动化测试，走手工验收清单（spec · Testing Decisions）。
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (res.ok) {
        router.replace("/");
        router.refresh();
        return;
      }
      const body = (await res.json().catch(() => null)) as {
        error?: { code?: string; message?: string };
      } | null;
      // 限速时透出服务端给的等待提示；其余失败一律统一口径，
      // 不区分"邮箱不存在"和"密码不对"
      setError(
        body?.error?.code === "RATE_LIMITED"
          ? (body.error.message ?? "尝试次数过多，请稍后再试")
          : "邮箱或密码不对"
      );
    } catch {
      setError("网络开小差了，请重试");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-5">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-3xl bg-white p-8 shadow-md ring-1 ring-slate-100"
      >
        <h1 className="text-3xl font-bold tracking-tight">英语跟读</h1>
        <p className="mt-2 text-lg text-slate-500">家长登录后开始练习</p>

        <label htmlFor="email" className="mt-8 block text-lg font-semibold">
          邮箱
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-2 w-full rounded-2xl bg-slate-50 px-4 py-3 text-lg ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-400"
        />

        <label htmlFor="password" className="mt-5 block text-lg font-semibold">
          密码
        </label>
        <input
          id="password"
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-2 w-full rounded-2xl bg-slate-50 px-4 py-3 text-lg ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-400"
        />

        {error && (
          <p role="alert" className="mt-4 text-lg text-red-600">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="mt-6 w-full rounded-2xl bg-emerald-500 py-4 text-xl font-bold text-white shadow-md active:bg-emerald-600 disabled:opacity-40"
        >
          {submitting ? "登录中…" : "登录"}
        </button>
      </form>
    </main>
  );
}
