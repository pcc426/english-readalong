"use client";

// 管理页：管理员创建家长账号与重置密码。V0.2.5（票 01）从 (shell) 外移入壳内，
// 修复进入后侧边栏/TopNav 消失、只能浏览器返回的 bug；URL 仍为 /admin。
// 加载时经 /api/auth/me 判定权限，未登录/非管理员只显示无权限提示，不渲染任何表单。
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
      className="mt-auto w-full pt-6 rounded-2xl bg-emerald-500 py-4 text-xl font-bold text-white shadow-md active:bg-emerald-600 disabled:opacity-40"
    >
      {props.children}
    </button>
  );
}

/** 创建/重置共用表单：两处仅标题、文案与提交端点不同，校验、布局、反馈完全一致 */
function AccountForm(props: {
  title: string;
  emailFieldId: string;
  passwordFieldId: string;
  passwordLabel: string;
  hint: string;
  submittingLabel: string;
  submitLabel: string;
  submit: (body: { email: string; password: string }) => Promise<AdminFormResult>;
  successMessage: (email: string) => string;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [result, setResult] = useState<AdminFormResult | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    if (!isValidEmail(email)) {
      setResult({ ok: false, message: "邮箱格式不对" });
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setResult({
        ok: false,
        message: `${props.passwordLabel}至少 ${MIN_PASSWORD_LENGTH} 位`,
      });
      return;
    }
    setSubmitting(true);
    setResult(null);
    const res = await props.submit({ email, password });
    setSubmitting(false);
    if (res.ok) {
      setResult({ ok: true, message: props.successMessage(email) });
      setEmail("");
      setPassword("");
    } else {
      setResult(res);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex h-full flex-col"
    >
      <h2 className="text-2xl font-bold tracking-tight">{props.title}</h2>
      <Field
        id={props.emailFieldId}
        label="邮箱"
        type="email"
        value={email}
        autoComplete="off"
        onChange={setEmail}
      />
      <Field
        id={props.passwordFieldId}
        label={props.passwordLabel}
        type="password"
        value={password}
        autoComplete="new-password"
        onChange={setPassword}
      />
      <p className="mt-2 text-base text-slate-400">{props.hint}</p>
      {result && <Feedback message={result.message} ok={result.ok} />}
      <SubmitButton submitting={submitting}>
        {submitting ? props.submittingLabel : props.submitLabel}
      </SubmitButton>
    </form>
  );
}

function CreateAccountForm() {
  return (
    <AccountForm
      title="创建家长账号"
      emailFieldId="create-email"
      passwordFieldId="create-password"
      passwordLabel="初始密码"
      hint={`至少 ${MIN_PASSWORD_LENGTH} 位，创建后告知家长`}
      submittingLabel="创建中…"
      submitLabel="创建账号"
      submit={({ email, password }) =>
        postAdmin("/api/admin/accounts", { email, initialPassword: password })
      }
      successMessage={(email) => `已创建家长账号 ${email.trim().toLowerCase()}`}
    />
  );
}

function ResetPasswordForm() {
  return (
    <AccountForm
      title="重置密码"
      emailFieldId="reset-email"
      passwordFieldId="reset-password"
      passwordLabel="新密码"
      hint={`至少 ${MIN_PASSWORD_LENGTH} 位，旧密码立即失效`}
      submittingLabel="重置中…"
      submitLabel="重置密码"
      submit={({ email, password }) =>
        postAdmin("/api/admin/accounts/password-reset", {
          email,
          newPassword: password,
        })
      }
      successMessage={(email) => `已重置 ${email.trim().toLowerCase()} 的密码`}
    />
  );
}

/** 教材内容可见性开关（v0.3.6）：默认关闭 = 仅管理员可见；打开 = 所有账号可见 */
function ContentVisibilityCard() {
  const [isPublic, setIsPublic] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/content-visibility");
        if (cancelled) return;
        if (!res.ok) {
          setLoading(false);
          setError("读取可见性设置失败，请刷新重试");
          return;
        }
        const body = (await res.json()) as { standardContentPublic?: boolean };
        if (!cancelled) {
          setIsPublic(body.standardContentPublic === true);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setLoading(false);
          setError("网络开小差了，请刷新重试");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function toggle() {
    if (saving || isPublic === null) return;
    const next = !isPublic;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/content-visibility", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ standardContentPublic: next }),
      });
      const body = (await res.json().catch(() => null)) as {
        standardContentPublic?: boolean;
        error?: { message?: string };
      } | null;
      if (!res.ok) {
        setSaving(false);
        setError(body?.error?.message ?? "保存失败，请重试");
        return;
      }
      const actual = body?.standardContentPublic ?? next;
      setIsPublic(actual);
      setSaving(false);
      setNotice(
        actual ? "已对家庭账号开放教材内容" : "已收紧为仅管理员可见"
      );
    } catch {
      setSaving(false);
      setError("网络开小差了，请重试");
    }
  }

  const on = isPublic === true;

  return (
    <section className="mt-6 rounded-3xl bg-white p-7 shadow-md ring-1 ring-slate-100">
      <div className="flex items-start justify-between gap-6">
        <div className="max-w-xl">
          <h2 className="text-2xl font-bold tracking-tight">教材内容可见性</h2>
          <p className="mt-2 text-base text-slate-500">
            关闭时，家庭账号看不到「教材内容」入口，也无法播放标准教材视频；管理员不受影响。
          </p>
          <p
            className={`mt-3 text-lg font-bold ${
              loading ? "text-slate-400" : on ? "text-emerald-600" : "text-amber-600"
            }`}
            role="status"
          >
            {loading ? "读取中…" : on ? "对家庭账号开放" : "仅管理员可见"}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label="教材内容对家庭账号开放"
          disabled={loading || saving || isPublic === null}
          onClick={toggle}
          className={`relative mt-1 h-9 w-16 shrink-0 rounded-full transition ${
            on ? "bg-emerald-500" : "bg-slate-300"
          } disabled:opacity-50`}
        >
          <span
            className={`absolute top-1 h-7 w-7 rounded-full bg-white shadow transition-all ${
              on ? "left-8" : "left-1"
            }`}
          />
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-3 text-base text-red-600">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="mt-3 text-base text-emerald-600">
          {notice}
        </p>
      )}
    </section>
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
    <>
      {access === "loading" && (
        <div className="flex min-h-full items-center justify-center px-5 py-10">
          <p className="text-lg text-slate-400">加载中…</p>
        </div>
      )}
      {access === "denied" && (
        <div className="flex min-h-full items-center justify-center px-5 py-10">
          <div className="w-full max-w-sm rounded-3xl bg-white p-8 text-center shadow-md ring-1 ring-slate-100">
            <h1 className="text-2xl font-bold tracking-tight">无权限</h1>
            <p className="mt-3 text-lg text-slate-500">
              此页面仅管理员可见，请用管理员账号登录。
            </p>
          </div>
        </div>
      )}
      {access === "allowed" && (
        <div className="mx-auto max-w-5xl px-6 py-8">
          <h1 className="text-3xl font-bold tracking-tight">管理</h1>

          {/* 主任务 hero：标准内容制作。后续新增管理功能在下方卡片区整宽向下堆叠 */}
          <section className="mt-8 flex flex-col gap-6 rounded-3xl bg-emerald-50 p-8 ring-1 ring-emerald-100 md:flex-row md:items-center md:justify-between">
            <div className="max-w-xl">
              <h2 className="text-2xl font-bold tracking-tight text-emerald-900">
                标准内容制作
              </h2>
              <p className="mt-2 text-lg text-emerald-800/80">
                用同一条上传→校对→定稿管线制作沪教版教材内容；定稿后按「教材内容可见性」开关决定是否对家庭账号开放。
              </p>
            </div>
            <a
              href="/admin/standard"
              className="shrink-0 rounded-2xl bg-emerald-500 px-8 py-4 text-center text-xl font-bold text-white shadow-md active:bg-emerald-600"
            >
              进入标准内容制作 →
            </a>
          </section>

          <ContentVisibilityCard />

          <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
            <section className="h-full rounded-3xl bg-white p-7 shadow-md ring-1 ring-slate-100">
              <CreateAccountForm />
            </section>
            <section className="h-full rounded-3xl bg-white p-7 shadow-md ring-1 ring-slate-100">
              <ResetPasswordForm />
            </section>
          </div>
        </div>
      )}
    </>
  );
}
