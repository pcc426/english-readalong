"use client";

// 管理页（票 02）：管理员创建家长账号与重置密码。独立页面，不走侧边栏壳
// （侧边栏的「管理」入口是 03 号票）。加载时经 /api/auth/me 判定权限，
// 未登录/非管理员只显示无权限提示，不渲染任何表单。
// UI 不做自动化测试，走手工验收清单（spec · Testing Decisions）。
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { isValidEmail, MIN_PASSWORD_LENGTH } from "@/lib/admin/validation";

type AccessState = "loading" | "allowed" | "denied";

interface AdminFormResult {
  ok: boolean;
  message: string;
}

/** 统一的提交与错误透出：服务端中文错误（如 409 邮箱已存在）原样展示给管理员 */
async function postAdmin(
  url: string,
  body: Record<string, string>
): Promise<AdminFormResult> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    if (res.ok) return { ok: true, message: "" };
    return {
      ok: false,
      message:
        data?.error?.message ?? `操作失败（${res.status}），请稍后再试`,
    };
  } catch {
    return { ok: false, message: "网络开小差了，请重试" };
  }
}

function Field(props: {
  id: string;
  label: string;
  type: string;
  value: string;
  autoComplete?: string;
  onChange: (value: string) => void;
}) {
  return (
    <>
      <label htmlFor={props.id} className="mt-4 block text-lg font-semibold">
        {props.label}
      </label>
      <input
        id={props.id}
        type={props.type}
        required
        autoComplete={props.autoComplete}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        className="mt-2 w-full rounded-2xl bg-slate-50 px-4 py-3 text-lg ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-400"
      />
    </>
  );
}

function Feedback(props: { message: string; ok: boolean }) {
  if (!props.message) return null;
  return (
    <p
      role={props.ok ? "status" : "alert"}
      className={`mt-4 text-lg ${props.ok ? "text-emerald-600" : "text-red-600"}`}
    >
      {props.message}
    </p>
  );
}

function SubmitButton(props: { submitting: boolean; children: ReactNode }) {
  return (
    <button
      type="submit"
      disabled={props.submitting}
      className="mt-6 w-full rounded-2xl bg-emerald-500 py-4 text-xl font-bold text-white shadow-md active:bg-emerald-600 disabled:opacity-40"
    >
      {props.children}
    </button>
  );
}

function CreateAccountForm() {
  const [email, setEmail] = useState("");
  const [initialPassword, setInitialPassword] = useState("");
  const [result, setResult] = useState<AdminFormResult | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    if (!isValidEmail(email)) {
      setResult({ ok: false, message: "邮箱格式不对" });
      return;
    }
    if (initialPassword.length < MIN_PASSWORD_LENGTH) {
      setResult({
        ok: false,
        message: `初始密码至少 ${MIN_PASSWORD_LENGTH} 位`,
      });
      return;
    }
    setSubmitting(true);
    setResult(null);
    const res = await postAdmin("/api/admin/accounts", {
      email,
      initialPassword,
    });
    setSubmitting(false);
    if (res.ok) {
      setResult({ ok: true, message: `已创建家长账号 ${email.trim().toLowerCase()}` });
      setEmail("");
      setInitialPassword("");
    } else {
      setResult(res);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full max-w-sm rounded-3xl bg-white p-8 shadow-md ring-1 ring-slate-100"
    >
      <h2 className="text-2xl font-bold tracking-tight">创建家长账号</h2>
      <Field
        id="create-email"
        label="邮箱"
        type="email"
        value={email}
        autoComplete="off"
        onChange={setEmail}
      />
      <Field
        id="create-password"
        label="初始密码"
        type="password"
        value={initialPassword}
        autoComplete="new-password"
        onChange={setInitialPassword}
      />
      <p className="mt-2 text-base text-slate-400">
        至少 {MIN_PASSWORD_LENGTH} 位，创建后告知家长
      </p>
      {result && <Feedback message={result.message} ok={result.ok} />}
      <SubmitButton submitting={submitting}>
        {submitting ? "创建中…" : "创建账号"}
      </SubmitButton>
    </form>
  );
}

function ResetPasswordForm() {
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [result, setResult] = useState<AdminFormResult | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    if (!isValidEmail(email)) {
      setResult({ ok: false, message: "邮箱格式不对" });
      return;
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setResult({ ok: false, message: `新密码至少 ${MIN_PASSWORD_LENGTH} 位` });
      return;
    }
    setSubmitting(true);
    setResult(null);
    const res = await postAdmin("/api/admin/accounts/password-reset", {
      email,
      newPassword,
    });
    setSubmitting(false);
    if (res.ok) {
      setResult({ ok: true, message: `已重置 ${email.trim().toLowerCase()} 的密码` });
      setEmail("");
      setNewPassword("");
    } else {
      setResult(res);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full max-w-sm rounded-3xl bg-white p-8 shadow-md ring-1 ring-slate-100"
    >
      <h2 className="text-2xl font-bold tracking-tight">重置密码</h2>
      <Field
        id="reset-email"
        label="邮箱"
        type="email"
        value={email}
        autoComplete="off"
        onChange={setEmail}
      />
      <Field
        id="reset-password"
        label="新密码"
        type="password"
        value={newPassword}
        autoComplete="new-password"
        onChange={setNewPassword}
      />
      <p className="mt-2 text-base text-slate-400">
        至少 {MIN_PASSWORD_LENGTH} 位，旧密码立即失效
      </p>
      {result && <Feedback message={result.message} ok={result.ok} />}
      <SubmitButton submitting={submitting}>
        {submitting ? "重置中…" : "重置密码"}
      </SubmitButton>
    </form>
  );
}

export default function AdminPage() {
  const [access, setAccess] = useState<AccessState>("loading");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me")
      .then(async (res) => {
        if (!res.ok) return null;
        return (await res.json()) as { account?: { isAdmin?: boolean } } | null;
      })
      .then((body) => {
        if (!cancelled) setAccess(body?.account?.isAdmin ? "allowed" : "denied");
      })
      .catch(() => {
        if (!cancelled) setAccess("denied");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-5 py-10">
      {access === "loading" && <p className="text-lg text-slate-400">加载中…</p>}
      {access === "denied" && (
        <div className="w-full max-w-sm rounded-3xl bg-white p-8 text-center shadow-md ring-1 ring-slate-100">
          <h1 className="text-2xl font-bold tracking-tight">无权限</h1>
          <p className="mt-3 text-lg text-slate-500">
            此页面仅管理员可见，请用管理员账号登录。
          </p>
        </div>
      )}
      {access === "allowed" && (
        <>
          <h1 className="mb-8 text-3xl font-bold tracking-tight">管理</h1>
          <div className="flex w-full flex-col items-center gap-8 md:flex-row md:items-start md:justify-center">
            <CreateAccountForm />
            <ResetPasswordForm />
          </div>
        </>
      )}
    </main>
  );
}
