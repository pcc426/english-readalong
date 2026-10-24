"use client";

// 左侧边栏（票 03）：教材内容 / 自定义内容两个主入口，管理员额外可见「管理」。
// /admin 页面本身由票 02 提供，这里只放链接。
import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavItem {
  href: string;
  label: string;
  /** "/" 需要精确匹配，否则永远高亮 */
  exact: boolean;
}

const BASE_ITEMS: NavItem[] = [
  { href: "/", label: "教材内容", exact: true },
  { href: "/custom", label: "自定义内容", exact: false },
];

const ADMIN_ITEM: NavItem = { href: "/admin", label: "管理", exact: false };

export default function Sidebar({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const items = isAdmin ? [...BASE_ITEMS, ADMIN_ITEM] : BASE_ITEMS;

  return (
    <aside className="flex w-52 shrink-0 flex-col border-r border-slate-100 bg-white px-4 py-6">
      <div className="px-2 text-2xl font-bold tracking-tight">英语跟读</div>

      <nav className="mt-8 space-y-2">
        {items.map((item) => {
          const active = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`block rounded-2xl px-4 py-3 text-lg font-semibold ${
                active
                  ? "bg-emerald-500 text-white shadow-sm"
                  : "text-slate-600 active:bg-slate-50"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
