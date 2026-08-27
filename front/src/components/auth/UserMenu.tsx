"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { useAuth } from "@/components/auth/AuthProvider";
import {
  BellIcon,
  BookmarkIcon,
  ChevronDownIcon,
  FileTextIcon,
  GridIcon,
  LogOutIcon,
  SettingsIcon,
} from "@/components/icons";
import { Avatar } from "@/components/ui/avatar";
import { isAdmin } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { NotificationBell } from "@/components/notifications/NotificationBell";

interface UserMenuProps {
  variant?: "desktop" | "mobile";
  /** 移动端菜单中点击导航项/登出后的回调（用于收起外层菜单）。 */
  onNavigate?: () => void;
  /** 深色导航/菜单里使用浅色文字与白色主按钮。 */
  light?: boolean;
}

export function UserMenu({
  variant = "desktop",
  onNavigate,
  light = false,
}: UserMenuProps) {
  const { user, status, logout } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const handleLogout = async () => {
    setOpen(false);
    onNavigate?.();
    await logout();
    router.push("/");
  };

  if (status === "loading") {
    if (variant === "desktop" && light) {
      return (
        <div className="flex items-center gap-2" aria-hidden="true">
          <span className="inline-flex h-9 items-center rounded-full px-3.5 text-[13px] font-medium text-white/70">
            登录
          </span>
          <span className="inline-flex h-9 items-center justify-center rounded-full bg-white px-4 text-[13px] font-medium text-[#151719]">
            加入岛屿
          </span>
        </div>
      );
    }

    return (
      <div
        className={cn(
          "animate-pulse rounded-full",
          light ? "bg-white/15" : "bg-black/[0.06]",
          variant === "desktop" ? "h-9 w-28" : "h-11 w-full",
        )}
        aria-hidden="true"
      />
    );
  }

  if (status === "unauthenticated" || !user) {
    if (variant === "mobile") {
      return (
        <div className="flex flex-col gap-3">
          <Link
            href="/login"
            onClick={onNavigate}
            className={cn(
              "rounded-full border px-5 py-3 text-center text-[14px] font-medium transition-colors",
              light
                ? "border-white/25 text-white hover:bg-white/[0.14]"
                : "border-black/[0.12] text-[#1D1D1F] hover:bg-black/[0.04]",
            )}
          >
            登录
          </Link>
          <Link
            href="/register"
            onClick={onNavigate}
            className={cn(
              "rounded-full px-5 py-3 text-center text-[14px] font-medium transition-colors",
              light
                ? "bg-white text-[#151719] hover:bg-[#f2f2f2]"
                : "bg-[#151719] text-white hover:bg-black",
            )}
          >
            加入岛屿
          </Link>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-2">
        <Link
          href="/login"
          className={cn(
            "inline-flex h-9 items-center rounded-full px-3.5 text-[13px] font-medium outline-none transition-[background-color,color,transform] duration-200 active:scale-[0.97] focus-visible:ring-2",
            light
              ? "text-white hover:bg-white/[0.14] focus-visible:ring-white/45"
              : "text-[#53585C] hover:bg-black/[0.04] hover:text-[#151719] focus-visible:ring-ring",
          )}
        >
          登录
        </Link>
        <Link
          href="/register"
          className={cn(
            "inline-flex h-9 items-center justify-center rounded-full px-4 text-[13px] font-medium outline-none transition-[background-color,transform] duration-200 active:scale-[0.97] focus-visible:ring-2",
            light
              ? "bg-white text-[#151719] hover:bg-[#f2f2f2] focus-visible:ring-white/55"
              : "bg-[#151719] text-white hover:bg-black focus-visible:ring-ring",
          )}
        >
          加入岛屿
        </Link>
      </div>
    );
  }

  const profileHref = `/u/${user.username}`;
  const links = [
    { href: "/notifications", label: "通知", icon: BellIcon },
    { href: "/bookmarks", label: "我的收藏", icon: BookmarkIcon },
    { href: "/drafts", label: "我的草稿", icon: FileTextIcon },
    { href: "/settings", label: "账号设置", icon: SettingsIcon },
    ...(isAdmin(user.role)
      ? [{ href: "/admin", label: "管理后台", icon: GridIcon }]
      : []),
  ];

  if (variant === "mobile") {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-3 px-3 py-2">
          <Link
            href={profileHref}
            onClick={onNavigate}
            className="flex min-w-0 flex-1 items-center gap-3 rounded-xl outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Avatar src={user.avatarUrl} name={user.displayName} size={40} />
            <div className="min-w-0 leading-tight">
              <p
                className={cn(
                  "truncate text-[15px] font-semibold",
                  light ? "text-white" : "text-[#1D1D1F]",
                )}
              >
                {user.displayName}
              </p>
              <p
                className={cn(
                  "truncate text-[12px]",
                  light ? "text-white/55" : "text-[#8B9297]",
                )}
              >
                @{user.username}
              </p>
            </div>
          </Link>
          <NotificationBell light={light} />
        </div>
        {links.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-3 text-[15px] font-medium transition-colors",
              light
                ? "text-white/82 hover:bg-white/[0.14] hover:text-white"
                : "text-[#1D1D1F] hover:bg-black/[0.04]",
            )}
          >
            <item.icon
              className={cn(
                "size-[18px]",
                light ? "text-white/55" : "text-[#53585C]",
              )}
            />
            {item.label}
          </Link>
        ))}
        <button
          type="button"
          onClick={handleLogout}
          className="flex items-center gap-3 rounded-xl px-3 py-3 text-left text-[15px] font-medium text-destructive transition-colors hover:bg-black/[0.04]"
        >
          <LogOutIcon className="size-[18px]" />
          退出登录
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          "flex items-center gap-1.5 rounded-full p-0.5 pr-2 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
          light
            ? "text-white hover:bg-white/10"
            : "text-[#1D1D1F] hover:bg-black/[0.05]",
        )}
      >
        <Avatar src={user.avatarUrl} name={user.displayName} size={32} />
        <ChevronDownIcon
          className={cn(
            "size-4 transition-transform duration-200",
            light ? "text-white/70" : "text-[#8B9297]",
            open && "rotate-180",
          )}
        />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+10px)] w-56 overflow-hidden rounded-2xl border border-border bg-card p-1.5 shadow-[0_18px_50px_rgba(21,23,25,0.14)]"
        >
          <Link
            href={profileHref}
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 outline-none transition-colors hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Avatar src={user.avatarUrl} name={user.displayName} size={40} />
            <div className="min-w-0 leading-tight">
              <p className="truncate text-[14px] font-semibold text-foreground">
                {user.displayName}
              </p>
              <p className="truncate text-[12px] text-muted-foreground">
                @{user.username}
              </p>
            </div>
          </Link>
          <div className="my-1 h-px bg-border" />
          {links.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13px] font-medium text-foreground transition-colors hover:bg-secondary"
            >
              <item.icon className="size-4 text-muted-foreground" />
              {item.label}
            </Link>
          ))}
          <div className="my-1 h-px bg-border" />
          <button
            type="button"
            role="menuitem"
            onClick={handleLogout}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13px] font-medium text-destructive transition-colors hover:bg-destructive/8"
          >
            <LogOutIcon className="size-4" />
            退出登录
          </button>
        </div>
      ) : null}
    </div>
  );
}
