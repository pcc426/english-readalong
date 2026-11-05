"use client";

// 「教材内容」列表页（票 05，原型变体 A，V0.4 起路由为 /units）：顶部工具条（单元/模块筛选）+ 紧凑自适应网格。
// 数据走 GET /api/units：行含教材归属（票 03）、最近一次练习总星数（票 04）、
// 鉴权封面地址（票 01/05），默认序＝教材序（loader 排好，页面不重排）；
// 另返回 textbookUnits（注册教材全部单元）供单元下拉。筛选全在客户端（home-grid.ts）。
// 未登录时 GET /api/units 返回 401，由壳层统一重定向兜底，这里只标加载失败。
import { useEffect, useMemo, useState } from "react";
import { WeeklyLimitModal } from "@/components/shared/WeeklyLimitModal";
import { sourceLabel } from "@/lib/content/source-label";
import {
  filterStandardContent,
  moduleOptionsFor,
  type ModuleFilter,
  type UnitFilter,
} from "./home-grid";

// 与 GET /api/units 响应对应（壳只走 HTTP，不从 src/lib 引类型）
interface UnitOverview {
  id: string;
  title: string;
  source: string;
  sentenceCount: number;
  /** 教材归属（票 03）；未迁移老包为 null */
  unitNo: number | null;
  moduleKind: string | null;
  /** 枚举串副标题（票 03）；无归属时为 null，回退 sourceLabel 文案 */
  subtitle: string | null;
  /** 竖版封面（票 01）；无封面为 null，卡片显示占位 */
  poster: string | null;
  /** 最近一次练习获得的总星数（票 04）；从未练过为 null */
  latestRunStars: number | null;
  /** 本周（北京时间周一起算）完整练习入账次数（0–3，V0.4 账本口径） */
  weeklyRuns: number;
  encouragement: string;
}

/** 注册教材的单元（响应 textbookUnits 行，票 05） */
interface TextbookUnit {
  no: number;
  title: string;
}

export default function StandardContentPage() {
  const [units, setUnits] = useState<UnitOverview[] | null>(null);
  const [textbookUnits, setTextbookUnits] = useState<TextbookUnit[]>([]);
  const [failed, setFailed] = useState(false);
  const [unitFilter, setUnitFilter] = useState<UnitFilter>("all");
  const [moduleFilter, setModuleFilter] = useState<ModuleFilter>("all");
  // 本周练满 3 次的卡片：点卡不跳转，只弹限次说明（V0.4 账本口径）
  const [capped, setCapped] = useState<UnitOverview | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/units");
        if (cancelled) return;
        if (!res.ok) {
          setFailed(true);
          return;
        }
        const body = (await res.json()) as {
          units?: UnitOverview[];
          textbookUnits?: TextbookUnit[];
        };
        if (!cancelled) {
          setUnits(body.units ?? []);
          setTextbookUnits(body.textbookUnits ?? []);
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 换单元后原模块选择在该单元可能不存在，重置为「全部模块」（原型 A 联动行为）
  function onUnitChange(raw: string) {
    setUnitFilter(raw === "all" ? "all" : Number(raw));
    setModuleFilter("all");
  }

  const filtered = useMemo(
    () => (units ? filterStandardContent(units, unitFilter, moduleFilter) : []),
    [units, unitFilter, moduleFilter]
  );
  const moduleOptions = useMemo(
    () => (units ? moduleOptionsFor(units, unitFilter) : []),
    [units, unitFilter]
  );

  if (failed) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-8">
        <h1 className="text-2xl font-bold">教材内容</h1>
        <p className="mt-8 text-lg text-slate-400" role="alert">
          加载失败，请刷新重试
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <h1 className="text-2xl font-bold">教材内容</h1>

      <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-100">
        <select
          aria-label="按单元筛选"
          value={unitFilter}
          onChange={(e) => onUnitChange(e.target.value)}
          className="rounded-2xl border-0 bg-white px-4 py-2.5 text-base font-medium text-slate-700 ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-400"
        >
          <option value="all">全部单元</option>
          {textbookUnits.map((u) => (
            <option key={u.no} value={u.no}>
              Unit {u.no} · {u.title}
            </option>
          ))}
        </select>
        <select
          aria-label="按模块筛选"
          value={moduleFilter}
          onChange={(e) =>
            setModuleFilter(e.target.value === "all" ? "all" : e.target.value)
          }
          className="rounded-2xl border-0 bg-white px-4 py-2.5 text-base font-medium text-slate-700 ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-400"
        >
          <option value="all">全部模块</option>
          {moduleOptions.map((kind) => (
            <option key={kind} value={kind}>
              {kind}
            </option>
          ))}
        </select>
        <span className="ml-auto text-sm text-slate-500" role="status">
          {units === null ? "加载中…" : `${filtered.length} 个内容`}
        </span>
      </div>

      {units !== null && filtered.length === 0 ? (
        <div className="mt-10 rounded-3xl bg-white p-12 text-center text-slate-500 shadow-sm ring-1 ring-slate-100">
          这个筛选条件下还没有内容
        </div>
      ) : (
        <div className="mt-6 grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(180px,1fr))]">
          {filtered.map((unit) => (
            <ContentCard
              key={unit.id}
              unit={unit}
              onCapReached={setCapped}
            />
          ))}
        </div>
      )}

      <WeeklyLimitModal
        open={capped != null}
        onClose={() => setCapped(null)}
        contentType="standard"
      />
    </div>
  );
}

/** 网格卡（票 05，参照原型 ContentCard 重写）：9:16 封面 + 课文名 + 枚举串 + 总星数 */
function ContentCard({
  unit,
  onCapReached,
}: {
  unit: UnitOverview;
  onCapReached: (unit: UnitOverview) => void;
}) {
  return (
    <a
      href={`/units/${unit.id}`}
      onClick={(event) => {
        if (unit.weeklyRuns >= 3) {
          event.preventDefault();
          onCapReached(unit);
        }
      }}
      className="flex flex-col overflow-hidden rounded-3xl bg-white shadow-md ring-1 ring-slate-100 transition hover:-translate-y-0.5 hover:shadow-lg"
    >
      {/* 9:16 封面（票 01）；无封面显示占位不裂图。
          V0.3.1 票 03：「标准」徽标移到封面右上角（与自定义卡片一致），
          把整行宽度让给标题 */}
      <div className="relative">
        {unit.poster ? (
          // eslint-disable-next-line @next/next/no-img-element -- 鉴权媒体路由的动态路径，未配 next/image 域
          <img
            src={unit.poster}
            alt=""
            className="aspect-[3/4] w-full object-cover"
          />
        ) : (
          <div className="aspect-[3/4] w-full bg-slate-100" />
        )}
        <span className="absolute right-3 top-3 whitespace-nowrap rounded-full bg-sky-100 px-2.5 py-1 text-xs font-bold text-sky-700">
          标准
        </span>
      </div>
      <div className="flex flex-1 flex-col p-3">
        {/* 主标题＝课文名（票 03 迁移后的包标题）；独占整行 */}
        <h3 className="text-base font-bold leading-snug">{unit.title}</h3>
        {/* 副标题＝枚举串（票 03，服务端拼好下发）；无归属老包回退 sourceLabel 文案 */}
        <p className="mt-0.5 text-xs leading-snug text-slate-500">
          {unit.subtitle ??
            `${sourceLabel(unit.source)} · ${unit.sentenceCount} 句`}
        </p>
        <div className="mt-2 flex items-end justify-between gap-2 border-t border-slate-100 pt-2">
          {unit.latestRunStars != null ? (
            // 最近一次完整练习入账星（V0.4 账本口径，spec 决策 23）：🌟N 无空格
            <>
              <span className="text-2xl font-extrabold leading-none text-amber-500">
                🌟{unit.latestRunStars}
              </span>
              <p className="mt-0.5 text-[11px] text-slate-400">上次练完获得</p>
            </>
          ) : (
            <span className="text-xs font-medium text-slate-400">
              还没完整练过
            </span>
          )}
        </div>
        {/* V0.3.1 票 03：鼓励语 ≤10 字、不与星数并排，独占卡片最下一行 */}
        <p className="mt-auto pt-1 text-xs font-bold text-emerald-600">
          {unit.encouragement}
        </p>
      </div>
    </a>
  );
}
