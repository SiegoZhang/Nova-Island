"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { useAuth } from "@/components/auth/AuthProvider";
import { UserMenu } from "@/components/auth/UserMenu";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { CloseIcon, MenuIcon } from "@/components/icons";
import { eMono } from "@/lib/eleven";
import { cn } from "@/lib/utils";

// 导航栏按 Figma node 217:39「header」重做：不再是浮在内容上的玻璃胶囊，
// 而是一条贴顶通栏的扁平栏——左侧一排 JetBrains Mono 小号标签页（当前页
// 顶部有一道 2px 白色指示条、字重加粗），右侧是通知铃 + 白色方角「登录」
// 按钮 / 已登录时的用户菜单。栏底一道 rgba(255,255,255,0.12) 发丝线。
// 透明背景在浅色子页面上会看不清文字，这里补一层半透明黑 + 背板模糊，
// 沿用旧版玻璃导航的做法，保证浅色页也能读。

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
    <header
      className="fixed inset-x-0 top-0 z-50 h-[calc(48px+env(safe-area-inset-top,0px))] border-b border-white/[0.12] bg-[#070709]/85 pt-[env(safe-area-inset-top,0px)] backdrop-blur-md"
    >
      <nav
        aria-label="主导航"
        className="flex h-12 items-stretch justify-between pr-4 pl-4 md:pr-12 md:pl-12"
      >
        {/* 桌面：左侧标签页 */}
        <div className="hidden items-stretch min-[840px]:flex">
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
                  eMono,
                  "flex items-center border-t-2 px-4 text-[10px] whitespace-nowrap outline-none transition-colors duration-200 focus-visible:bg-white/[0.06]",
                  isActive
                    ? "border-[#f3f4f6] font-bold text-[#f3f4f6]"
                    : "border-transparent font-normal text-[#4b5563] hover:text-[#9ca3af]",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </div>

        {/* 移动：左侧只放当前页标签 */}
        <div className="flex items-center min-[840px]:hidden">
          <span className={cn(eMono, "text-[11px] font-bold text-[#f3f4f6]")}>
            {navigationItems.find((item) => item.href === activeHref)?.label ?? "新岛"}
          </span>
        </div>

        {/* 右侧：通知铃 + 登录 / 用户菜单 */}
        <div className="flex items-center gap-4 min-[840px]:gap-6">
          <div className="hidden items-center gap-4 min-[840px]:flex">
            <NotificationBell light />
            {canEnterCommunity ? (
              <UserMenu variant="desktop" light />
            ) : (
              <Link
                href="/login"
                className={cn(
                  eMono,
                  "inline-flex items-center rounded-[4px] border border-[#9ca3af] bg-white px-3 py-1.5 text-[10px] font-bold tracking-[0.06em] text-[#070709] uppercase outline-none transition-colors duration-200 hover:bg-[#e5e7eb] focus-visible:ring-2 focus-visible:ring-white/45",
                )}
              >
                登录
              </Link>
            )}
          </div>

          <button
            type="button"
            onClick={() => setIsMenuOpen((open) => !open)}
            aria-label={isMenuOpen ? "关闭菜单" : "打开菜单"}
            aria-expanded={isMenuOpen}
            aria-controls="mobile-menu"
            className="flex size-9 items-center justify-center rounded-[4px] text-[#f3f4f6] outline-none transition-colors duration-200 hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/45 min-[840px]:hidden"
          >
            {isMenuOpen ? <CloseIcon className="size-5" /> : <MenuIcon className="size-5" />}
          </button>
        </div>
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
            "fixed inset-x-0 top-[calc(48px+env(safe-area-inset-top,0px))] -z-10 h-[calc(100dvh-48px-env(safe-area-inset-top,0px))] w-full cursor-default bg-black/40 backdrop-blur-[2px] transition-opacity duration-200",
            isMenuOpen ? "opacity-100" : "opacity-0",
          )}
        />

        <div
          id="mobile-menu"
          inert={!isMenuOpen}
          aria-hidden={!isMenuOpen}
          className={cn(
            "absolute inset-x-0 top-full max-h-[min(74dvh,calc(100dvh-48px-12px))] origin-top overflow-y-auto overscroll-contain border-b border-white/[0.12] bg-black/85 p-2 backdrop-blur-md transition-[opacity,transform] duration-200",
            isMenuOpen ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0",
          )}
        >
          <nav
            aria-label="移动端导航"
            className="flex flex-col pb-[max(0.5rem,env(safe-area-inset-bottom,0px))]"
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
                    eMono,
                    "flex min-h-11 items-center border-l-2 px-4 text-[13px] outline-none transition-colors duration-200 focus-visible:bg-white/[0.06]",
                    isActive
                      ? "border-[#f3f4f6] font-bold text-[#f3f4f6]"
                      : "border-transparent font-normal text-[#4b5563] hover:text-[#9ca3af]",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}

            <div className="mt-2 border-t border-white/[0.12] pt-3">
              <UserMenu variant="mobile" onNavigate={closeMenu} light />
            </div>
          </nav>
        </div>
      </div>
    </header>
  );
}
