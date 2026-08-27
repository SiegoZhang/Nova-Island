"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { useAuth } from "@/components/auth/AuthProvider";
import { UserMenu } from "@/components/auth/UserMenu";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { CloseIcon, MenuIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

const navigationItems = [
  { label: "首页", href: "/" },
  { label: "AI社群", href: "/ai" },
  { label: "FDE", href: "/fde" },
  { label: "活动", href: "/community/events" },
  { label: "社区", href: "/community" },
  { label: "联系我们", href: "/contact" },
] as const;

function navHref(href: string, isAuthenticated: boolean): string {
  if (!href.startsWith("/community") || isAuthenticated) return href;
  return `/login?next=${encodeURIComponent(href)}`;
}

// "社区" (/community) 和 "活动" (/community/events) 前缀会重叠——停在
// /community/events 时两者都满足 "pathname 以 href 开头"，这里取匹配上的
// 最长 href（最具体的那个）作为唯一选中项，避免两个导航项同时高亮。
function getActiveHref(pathname: string): string | null {
  let activeHref: string | null = null;

  for (const item of navigationItems) {
    const isMatch =
      item.href === "/"
        ? pathname === "/"
        : pathname === item.href || pathname.startsWith(`${item.href}/`);

    if (isMatch && (!activeHref || item.href.length > activeHref.length)) {
      activeHref = item.href;
    }
  }

  return activeHref;
}

export function Navbar() {
  const { isAuthenticated, status } = useAuth();
  const canEnterCommunity = status === "authenticated" || isAuthenticated;
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const pathname = usePathname();
  const activeHref = getActiveHref(pathname);

  const closeMenu = () => setIsMenuOpen(false);

  // 菜单展开时锁定 body 滚动
  useEffect(() => {
    document.body.style.overflow = isMenuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isMenuOpen]);

  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-50 flex h-[var(--main-nav-safe-height)] items-center justify-center px-4 pt-[env(safe-area-inset-top,0px)]">
      <nav
        aria-label="主导航"
        className="pointer-events-auto relative flex h-12 items-center gap-5 rounded-full bg-black/[0.46] px-1.5 shadow-[0_16px_48px_rgba(0,0,0,0.22)] backdrop-blur-[18px] min-[840px]:gap-6"
      >
        <Link
          href="/"
          aria-label="NOVA Island 首页"
          className="inline-flex h-9 min-w-0 items-center rounded-full px-3.5 text-[14px] font-semibold tracking-[-0.01em] text-white outline-none transition-[background-color,transform] duration-200 hover:bg-white/[0.14] active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-white/45"
        >
          <span className="truncate">NOVA Island</span>
        </Link>

        <div className="hidden min-[840px]:flex">
          <div className="inline-flex items-center gap-1">
            {navigationItems.map((item) => {
              const isActive = item.href === activeHref;
              return (
                <Link
                  key={item.label}
                  href={navHref(item.href, canEnterCommunity)}
                  prefetch={
                    item.href.startsWith("/community") && canEnterCommunity
                      ? true
                      : undefined
                  }
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "inline-flex h-9 w-[72px] shrink-0 items-center justify-center rounded-full px-2.5 text-[13px] font-medium whitespace-nowrap text-white outline-none transition-[background-color,color,transform] duration-200 hover:bg-white/[0.10] active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-white/45",
                    isActive && "bg-white/[0.24] hover:bg-white/[0.24]",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>

        <div className="hidden items-center gap-2 min-[840px]:flex">
          <span
            aria-hidden="true"
            className="mx-1 h-6 w-px rounded-full bg-white/35"
          />
          <NotificationBell light />
          <UserMenu variant="desktop" light />
        </div>

        <button
          type="button"
          onClick={() => setIsMenuOpen((open) => !open)}
          aria-label={isMenuOpen ? "关闭菜单" : "打开菜单"}
          aria-expanded={isMenuOpen}
          aria-controls="mobile-menu"
          className="flex size-9 items-center justify-center rounded-full text-white outline-none transition-[background-color,transform] duration-200 hover:bg-white/10 active:scale-[0.96] focus-visible:ring-2 focus-visible:ring-white/45 min-[840px]:hidden"
        >
          {isMenuOpen ? (
            <CloseIcon className="size-5" />
          ) : (
            <MenuIcon className="size-5" />
          )}
        </button>
      </nav>

      {/* 移动端下拉菜单 */}
      <div
        className={cn(
          "min-[840px]:hidden",
          isMenuOpen ? "pointer-events-auto" : "pointer-events-none",
        )}
      >
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          onClick={() => setIsMenuOpen(false)}
          className={cn(
            "fixed inset-x-0 top-[var(--main-nav-safe-height)] -z-10 h-[calc(100dvh-var(--main-nav-safe-height))] w-full cursor-default bg-[#151719]/30 backdrop-blur-[2px] transition-opacity duration-200",
            isMenuOpen ? "opacity-100" : "opacity-0",
          )}
        />

        <div
          id="mobile-menu"
          inert={!isMenuOpen}
          aria-hidden={!isMenuOpen}
          className={cn(
            "absolute left-1/2 top-full w-[min(calc(100vw-2rem),360px)] max-h-[min(74dvh,calc(100dvh-var(--main-nav-safe-height)-12px))] -translate-x-1/2 origin-top overflow-y-auto overscroll-contain rounded-[22px] border border-white/[0.22] bg-black/[0.58] p-2 shadow-[0_24px_70px_rgba(21,23,25,0.28)] backdrop-blur-[18px] transition-[opacity,transform] duration-200",
            isMenuOpen
              ? "translate-y-2 opacity-100"
              : "translate-y-0 opacity-0",
          )}
        >
          <nav
            aria-label="移动端导航"
            className="flex flex-col gap-1 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]"
          >
            {navigationItems.map((item) => {
              const isActive = item.href === activeHref;
              return (
                <Link
                  key={item.label}
                  href={navHref(item.href, canEnterCommunity)}
                  prefetch={
                    item.href.startsWith("/community") && canEnterCommunity
                      ? true
                      : undefined
                  }
                  onClick={closeMenu}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "flex min-h-11 items-center justify-between rounded-[18px] px-4 text-[15px] font-medium outline-none transition-[background-color,color,transform] duration-200 active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-ring",
                    isActive
                      ? "bg-white/[0.24] text-white"
                      : "text-white/78 hover:bg-white/[0.10] hover:text-white",
                  )}
                >
                  <span>{item.label}</span>
                  <span
                    aria-hidden="true"
                    className={cn(
                      "size-1.5 rounded-full transition-colors",
                      isActive ? "bg-white" : "bg-transparent",
                    )}
                  />
                </Link>
              );
            })}

            <div className="mt-2 border-t border-white/20 pt-3">
              <UserMenu variant="mobile" onNavigate={closeMenu} light />
            </div>
          </nav>
        </div>
      </div>
    </header>
  );
}
