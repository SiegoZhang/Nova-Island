"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { useAuth } from "@/components/auth/AuthProvider";
import { InboxIcon } from "@/components/icons";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { isAdmin } from "@/lib/permissions";

export function AdminGate({ children }: { children: ReactNode }) {
  const { status, user } = useAuth();
  const router = useRouter();
  const allowed = status === "authenticated" && isAdmin(user?.role);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace(`/login?next=${encodeURIComponent("/admin")}`);
    }
  }, [status, router]);

  if (status === "loading" || status === "unauthenticated") {
    return (
      <div className="flex min-h-screen bg-background">
        <div className="hidden w-56 shrink-0 border-r border-border bg-secondary/50 md:block" />
        <div className="flex-1 px-6 py-8">
          <Skeleton className="h-9 w-48" />
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Skeleton className="h-36 rounded-[24px]" />
            <Skeleton className="h-36 rounded-[24px]" />
            <Skeleton className="h-36 rounded-[24px]" />
          </div>
        </div>
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <EmptyState
          icon={<InboxIcon className="size-6" />}
          title="需要管理员权限"
          description="管理后台仅对管理员开放。若你是领航员，请在帖子详情使用内容管理工具。"
          action={
            <Link
              href="/community"
              className="inline-flex h-10 items-center justify-center rounded-full bg-primary px-5 text-[13px] font-medium text-primary-foreground transition-[background-color,transform] duration-300 hover:-translate-y-px hover:bg-foreground/90"
            >
              返回社区
            </Link>
          }
        />
      </div>
    );
  }

  return <>{children}</>;
}
