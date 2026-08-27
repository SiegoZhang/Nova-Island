import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Suspense } from "react";

import { RequireAuth } from "@/components/auth/RequireAuth";
import { SecondaryNav } from "@/components/community/SecondaryNav";
import {
  CardGridSkeleton,
  PageHeaderSkeleton,
} from "@/components/community/skeletons";
import { Footer } from "@/components/Footer";
import { Navbar } from "@/components/Navbar";

export const metadata: Metadata = {
  title: "社区 · 新岛 AI",
  description: "精华、航海、专栏、榜单与活动，AI 原住民的日常聚集地",
};

function AuthFallback() {
  return (
    <div className="flex flex-1 flex-col gap-8">
      <PageHeaderSkeleton />
      <CardGridSkeleton count={6} />
    </div>
  );
}

export default function CommunityLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <div className="flex flex-col bg-background">
      {/* 主内容至少占满一屏，页脚（二维码等）落在首屏以下 */}
      <div className="flex min-h-screen flex-col">
        <Navbar />
        {/* 为固定主导航预留高度（含刘海安全区） */}
        <div
          className="h-[var(--main-nav-safe-height)]"
          aria-hidden="true"
        />
        <Suspense
          fallback={
            <div className="sticky top-[var(--main-nav-safe-height)] z-40 min-h-[52px] border-b border-border bg-background/85" />
          }
        >
          <SecondaryNav />
        </Suspense>
        <main className="section-container flex flex-1 flex-col py-6 md:py-10">
          <Suspense fallback={<AuthFallback />}>
            <RequireAuth>{children}</RequireAuth>
          </Suspense>
        </main>
      </div>
      <Footer />
    </div>
  );
}
