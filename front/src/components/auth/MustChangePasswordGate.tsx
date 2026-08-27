"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import type { ReactNode } from "react";

import { useAuth } from "@/components/auth/AuthProvider";

const ALLOWED_PREFIXES = ["/force-change-password", "/login", "/register"];

/**
 * 临时密码登录后强制进入改密页，其它页面一律重定向。
 */
export function MustChangePasswordGate({ children }: { children: ReactNode }) {
  const { user, status } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (status !== "authenticated" || !user?.mustChangePassword) return;
    const allowed = ALLOWED_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    );
    if (!allowed) {
      router.replace("/force-change-password");
    }
  }, [status, user?.mustChangePassword, pathname, router]);

  return <>{children}</>;
}
