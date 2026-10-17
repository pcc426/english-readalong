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
      <body className="min-h-screen bg-sky-50 text-slate-800 antialiased">
        {children}
      </body>
    </html>
  );
}
