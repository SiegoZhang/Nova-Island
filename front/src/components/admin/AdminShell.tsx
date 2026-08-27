"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { useAuth } from "@/components/auth/AuthProvider";
import { AdminNav } from "@/components/admin/AdminNav";
import { Avatar } from "@/components/ui/avatar";

const titles: { match: (path: string) => boolean; title: string; description: string }[] = [
  {
    match: (path) => path === "/admin",
    title: "总览",
    description: "查看已接通的管理能力与尚未开放的模块。",
  },
  {
    match: (path) => path.startsWith("/admin/users"),
    title: "用户管理",
    description: "搜索岛民，调整角色与账号状态。此处为唯一管理入口。",
  },
  {
    match: (path) => path.startsWith("/admin/content"),
    title: "内容运营",
    description: "集中处理隐藏与发布内容；详情页即时审帖仍可用。",
  },
  {
    match: (path) => path.startsWith("/admin/tags"),
    title: "标签库",
    description: "维护发帖可选标签；仅库内名称可被点选。",
  },
  {
    match: (path) => path.startsWith("/admin/operations"),
    title: "活动与航海",
    description: "运营与支付后台尚未设计，此处仅作诚实占位。",
  },
];

function resolveMeta(pathname: string) {
  return (
    titles.find((item) => item.match(pathname)) ?? {
      title: "管理后台",
      description: "与社区前台同一套视觉语言。",
    }
  );
}

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const meta = resolveMeta(pathname);

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-border bg-secondary/50 md:flex lg:w-60">
        <div className="border-b border-border px-5 py-5">
          <p className="text-[11px] font-semibold tracking-[0.16em] text-muted-foreground">
            ADMIN
          </p>
          <p className="mt-1.5 text-[16px] font-semibold tracking-tight text-foreground">
            新岛 · 管理
          </p>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-4">
          <AdminNav />
        </div>
        <div className="border-t border-border px-4 py-4">
          <Link
            href="/community"
            className="inline-flex h-9 w-full items-center justify-center rounded-full border border-border bg-card/70 px-3 text-[12px] font-medium text-foreground transition-colors hover:border-foreground/25 hover:bg-card"
          >
            返回社区
          </Link>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur-sm">
          <div className="flex items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
            <div className="min-w-0 md:hidden">
              <p className="text-[13px] font-semibold text-foreground">新岛 · 管理</p>
            </div>
            <div className="ml-auto flex items-center gap-3">
              <Link
                href="/community"
                className="inline-flex min-h-9 items-center text-[12px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                返回社区
              </Link>
              {user ? (
                <Link
                  href={`/u/${user.username}`}
                  className="flex items-center gap-2 rounded-full border border-border bg-card/60 py-1 pr-3 pl-1 transition-colors hover:border-foreground/20"
                >
                  <Avatar src={user.avatarUrl} name={user.displayName} size={28} />
                  <span className="max-w-[7rem] truncate text-[12px] font-medium text-foreground">
                    {user.displayName}
                  </span>
                </Link>
              ) : null}
            </div>
          </div>
          <div className="border-t border-border px-4 py-2.5 md:hidden">
            <AdminNav />
          </div>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          <div className="mb-6 max-w-5xl">
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              {meta.title}
            </h1>
            <p className="mt-2 max-w-2xl text-[14px] leading-6 text-muted-foreground">
              {meta.description}
            </p>
          </div>
          <div className="max-w-5xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
