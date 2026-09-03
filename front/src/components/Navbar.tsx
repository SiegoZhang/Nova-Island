"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { useAuth } from "@/components/auth/AuthProvider";
import { UserMenu } from "@/components/auth/UserMenu";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { CtaButton } from "@/components/CtaButton";
import { CloseIcon, MenuIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

// 子页面（AI社群 / FDE / 联系我们 / 社区 / 账号中心…）的导航栏。
//
// 与首页保持一致：首页那份是 home-variants/HomeNav.tsx，一枚「玻璃质感悬浮
// 胶囊」——贴顶居中、圆角、浅色半透明底 + 深色字、无阴影、只做 backdrop-blur。
// 这里是子页面用的 `fixed` 版本，视觉与首页那枚完全对齐，另外接入了登录态
// （通知铃 / 用户菜单）和移动端下拉菜单。
//
// ⚠️ 两处胶囊样式要同步改：改了这里也去 home-variants/HomeNav.tsx。

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
    <>
      {/* ── 悬浮胶囊导航：玻璃质感、无阴影、贴顶居中；与首页那枚一致 ── */}
      <nav
        aria-label="主导航"
        className="pointer-events-auto fixed left-1/2 top-2 z-[60] flex max-w-[calc(100vw-1rem)] -translate-x-1/2 items-center gap-1 rounded-full border border-white/50 bg-white/60 py-1.5 pr-1.5 pl-3 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.55)] backdrop-blur-2xl sm:top-3"
      >
        <Link
          href="/"
          className="shrink-0 whitespace-nowrap pr-2 pl-1 text-[13px] font-bold tracking-tight text-[#111]"
        >
          NOVA Island
        </Link>

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
                "shrink-0 whitespace-nowrap rounded-full px-4 py-1.5 text-[12px] transition-colors",
                isActive
                  ? "font-semibold text-[#111]"
                  : "hidden text-black/55 hover:text-[#111] md:block",
              )}
            >
              {item.label}
            </Link>
          );
        })}

        {/* 右侧：未登录 → 登录 + 加入岛屿；已登录 → 通知铃 + 用户菜单 */}
        {canEnterCommunity ? (
          <div className="ml-1 flex shrink-0 items-center gap-1.5">
            <NotificationBell />
            <UserMenu variant="desktop" />
          </div>
        ) : (
          <>
            <Link
              href="/login"
              className="hidden shrink-0 whitespace-nowrap rounded-full px-4 py-1.5 text-[12px] text-black/55 transition-colors hover:text-[#111] sm:block"
            >
              登录
            </Link>
            <CtaButton href="/register" size="sm" className="ml-1 shrink-0">
              加入岛屿
            </CtaButton>
          </>
        )}

        {/* 移动端菜单按钮：只在窄屏出现（桌面导航项已全部展开） */}
        <button
          type="button"
          onClick={() => setIsMenuOpen((open) => !open)}
          aria-label={isMenuOpen ? "关闭菜单" : "打开菜单"}
          aria-expanded={isMenuOpen}
          aria-controls="mobile-menu"
          className="ml-0.5 flex size-8 shrink-0 items-center justify-center rounded-full text-[#111] outline-none transition-colors hover:bg-black/[0.06] focus-visible:ring-2 focus-visible:ring-black/20 md:hidden"
        >
          {isMenuOpen ? (
            <CloseIcon className="size-4" />
          ) : (
            <MenuIcon className="size-4" />
          )}
        </button>
      </nav>

      {/* ── 移动端下拉菜单 ── */}
      <div
        className={cn(
          "md:hidden",
          isMenuOpen ? "pointer-events-auto" : "pointer-events-none",
        )}
      >
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          onClick={() => setIsMenuOpen(false)}
          className={cn(
            "fixed inset-0 z-[55] h-[100dvh] w-full cursor-default bg-black/30 backdrop-blur-[2px] transition-opacity duration-200",
            isMenuOpen ? "opacity-100" : "opacity-0",
          )}
        />

        <div
          id="mobile-menu"
          inert={!isMenuOpen}
          aria-hidden={!isMenuOpen}
          className={cn(
            "fixed left-1/2 top-[60px] z-[60] w-[min(calc(100vw-1rem),360px)] origin-top -translate-x-1/2 overflow-y-auto overscroll-contain rounded-3xl border border-white/50 bg-white/80 p-2 shadow-[0_18px_50px_rgba(21,23,25,0.14)] backdrop-blur-2xl transition-[opacity,transform] duration-200",
            isMenuOpen
              ? "translate-y-0 opacity-100"
              : "-translate-y-2 opacity-0",
          )}
        >
          <nav
            aria-label="移动端导航"
            className="flex flex-col pb-[max(0.25rem,env(safe-area-inset-bottom,0px))]"
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
                    "flex min-h-11 items-center rounded-full px-4 text-[14px] outline-none transition-colors focus-visible:bg-black/[0.05]",
                    isActive
                      ? "font-semibold text-[#111]"
                      : "font-normal text-black/55 hover:text-[#111]",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}

            <div className="mt-2 border-t border-black/[0.08] px-2 pt-3">
              <UserMenu variant="mobile" onNavigate={closeMenu} />
            </div>
          </nav>
        </div>
      </div>
    </>
  );
}
