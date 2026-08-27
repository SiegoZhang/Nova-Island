"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { useAuth } from "@/components/auth/AuthProvider";
import { BellIcon } from "@/components/icons";
import { cn } from "@/lib/utils";
import { getUnreadNotificationCount } from "@/services/notifications";

export function NotificationBell({
  className,
  light = false,
}: {
  className?: string;
  light?: boolean;
}) {
  const { status } = useAuth();

  if (status !== "authenticated") {
    return null;
  }

  return <AuthenticatedNotificationBell className={className} light={light} />;
}

function AuthenticatedNotificationBell({
  className,
  light,
}: {
  className?: string;
  light: boolean;
}) {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const data = await getUnreadNotificationCount();
      setCount(data.count);
    } catch {
      // 静默失败，不打断导航
    }
  }, []);

  useEffect(() => {
    const initialTimer = window.setTimeout(() => {
      void refresh();
    }, 0);
    const timer = window.setInterval(() => {
      void refresh();
    }, 30000);
    const onFocus = () => {
      void refresh();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  return (
    <Link
      href="/notifications"
      aria-label={count > 0 ? `通知，${count} 条未读` : "通知"}
      className={cn(
        "relative inline-flex size-9 items-center justify-center rounded-full outline-none transition-[background-color,color,transform] duration-200 active:scale-[0.96] focus-visible:ring-2",
        light
          ? "text-white/[0.86] hover:bg-white/10 focus-visible:ring-white/45"
          : "text-foreground hover:bg-secondary focus-visible:ring-ring",
        className,
      )}
    >
      <BellIcon className="size-4" />
      {count > 0 ? (
        <span
          className={cn(
            "absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold",
            light
              ? "bg-white text-[#151719]"
              : "bg-primary text-primary-foreground",
          )}
        >
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </Link>
  );
}
