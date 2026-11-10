// 教材制作两页共用的类型与门禁 hook（V0.3.4 票 04，拆自 StandardAdminClient）。
"use client";

import { useEffect, useState } from "react";

export interface TextbookCatalogUnit {
  unitId: string;
  index: number;
  title: string;
  modules: Array<{ moduleKind: string; title: string; sentenceCount: number }>;
}

/** 注册表里的一册（学期下拉项）；units 是该册的单元/模块清单 */
export interface TextbookCatalogBook {
  id: string;
  shortName: string;
  display: string;
  units: TextbookCatalogUnit[];
}

/** 服务端从教材注册表取出的版本 + 书目清单（RSC props 传入） */
export interface TextbookCatalog {
  series: { shortName: string; display: string };
  books: TextbookCatalogBook[];
}

// 与 GET /api/drafts 响应对应（壳只走 HTTP，不从 src/lib 引类型）
export interface StandardDraftOverview {
  id: string;
  title: string;
  type: string;
  unitId: string | null;
  moduleKind: string | null;
  status: "transcribing" | "proofreading" | "published";
  /** 转写失败原因（V0.4.2）：非空时卡片提示「转写失败，请重新上传视频」 */
  transcribeError: string | null;
  sentenceCount: number;
  confirmedCount: number;
  /** 枚举串（V0.3.4 票 04）：服务端生成；custom / 注册表查不到为 null */
  subtitle: string | null;
  posterUrl: string | null;
  createdAt: string;
}

export type AccessState = "loading" | "allowed" | "denied";

/** 管理员门禁（非管理员 denied，与 /admin 同约定） */
export function useAdminAccess(): AccessState {
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
  return access;
}

/** 门禁三态的公共渲染（两页一致的加载/拒绝卡） */
export function AccessGate({
  access,
  children,
}: {
  access: AccessState;
  children: React.ReactNode;
}) {
  if (access === "loading") {
    return (
      <div className="mx-auto max-w-xl px-5 py-8">
        <p className="text-lg text-slate-400">加载中…</p>
      </div>
    );
  }
  if (access === "denied") {
    return (
      <div className="mx-auto max-w-xl px-5 py-8">
        <h1 className="text-3xl font-bold tracking-tight">标准内容制作</h1>
        <p
          className="mt-8 rounded-3xl bg-white p-8 text-center text-lg text-slate-500 shadow-md ring-1 ring-slate-100"
          role="alert"
        >
          此页面仅管理员可见。
        </p>
      </div>
    );
  }
  return <>{children}</>;
}
