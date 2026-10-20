import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "英语跟读",
  description: "小学英语课文跟读练习",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      {/* suppressHydrationWarning：浏览器扩展会往 body 注入属性（如 mpa-*），
          触发水合不匹配的警告；扩展注入与本应用无关，静默即可 */}
      <body
        suppressHydrationWarning
        className="min-h-screen bg-sky-50 text-slate-800 antialiased"
      >
        {children}
      </body>
    </html>
  );
}
