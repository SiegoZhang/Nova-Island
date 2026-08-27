"use client";

import { useRouter } from "next/navigation";

import { ChevronLeftIcon } from "@/components/icons";

interface DetailBackLinkProps {
  /** 无可用历史时的回退地址（如社区列表 / 用户主页）。 */
  fallbackHref: string;
  label?: string;
}

/**
 * 优先返回上一页；无可用历史时跳到 fallback。
 * App Router 客户端跳转不会更新 document.referrer，故同时参考 history.length。
 */
export function DetailBackLink({
  fallbackHref,
  label = "返回",
}: DetailBackLinkProps) {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => {
        if (typeof window === "undefined") {
          router.push(fallbackHref);
          return;
        }
        const sameOriginReferrer =
          Boolean(document.referrer) &&
          document.referrer.startsWith(window.location.origin);
        if (sameOriginReferrer || window.history.length > 1) {
          router.back();
          return;
        }
        router.push(fallbackHref);
      }}
      className="inline-flex items-center gap-1 rounded-full border border-border bg-card/60 px-3 py-1.5 text-[12px] font-medium text-foreground transition-colors hover:border-foreground/25 hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <ChevronLeftIcon className="size-3.5" />
      {label}
    </button>
  );
}
