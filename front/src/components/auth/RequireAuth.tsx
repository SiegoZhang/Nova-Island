"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { useAuth } from "@/components/auth/AuthProvider";
import { CardGridSkeleton, PageHeaderSkeleton } from "@/components/community/skeletons";

interface RequireAuthProps {
  children: ReactNode;
  /** 无有效会话时的回跳路径；默认当前 pathname + search */
  nextPath?: string;
}

/**
 * 客户端登录墙：Cookie 过期或仅内存态失效时，避免短暂露出社区内容。
 * 与 middleware 互补；middleware 负责无 Cookie 的硬跳转。
 */
export function RequireAuth({ children, nextPath }: RequireAuthProps) {
  const { status } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const fallback =
    nextPath ??
    `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace(`/login?next=${encodeURIComponent(fallback)}`);
    }
  }, [status, router, fallback]);

  if (status === "loading" || status === "unauthenticated") {
    return (
      <div className="flex flex-1 flex-col gap-8">
        <PageHeaderSkeleton />
        <CardGridSkeleton count={6} />
      </div>
    );
  }

  return <>{children}</>;
}
