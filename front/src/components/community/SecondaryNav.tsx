"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, type FormEvent } from "react";

import { communityNavItems } from "@/components/community/nav-config";
import { SearchIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

function isItemActive(pathname: string, href: string): boolean {
  if (href === "/community") return pathname === "/community";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SecondaryNav() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const listRef = useRef<HTMLUListElement>(null);
  const query =
    pathname.startsWith("/community/search") ? searchParams.get("q") ?? "" : "";

  const onSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const q = String(data.get("q") ?? "").trim();
    if (!q) {
      router.push("/community/search");
      return;
    }
    router.push(`/community/search?q=${encodeURIComponent(q)}`);
  };

  // 当前项滚入视野，避免榜单等落在屏外却无感知
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const active = list.querySelector<HTMLElement>("[aria-current='page']");
    active?.scrollIntoView({
      inline: "nearest",
      block: "nearest",
      behavior: "smooth",
    });
  }, [pathname]);

  return (
    <div className="sticky top-[var(--main-nav-safe-height)] z-40 border-b border-border bg-background/85 backdrop-blur-[18px]">
      <nav
        aria-label="社区二级导航"
        className="section-container flex flex-col gap-2 py-2 md:h-[52px] md:flex-row md:items-center md:gap-4 md:py-0"
      >
        <div className="relative min-w-0 flex-1">
          <ul
            ref={listRef}
            className="flex items-center gap-1 overflow-x-auto overscroll-x-contain scroll-smooth [-ms-overflow-style:none] [scrollbar-width:none] md:gap-2 [&::-webkit-scrollbar]:hidden"
          >
            {communityNavItems.map((item) => {
              const active = isItemActive(pathname, item.href);
              const Icon = item.icon;

              return (
                <li key={item.href} className="shrink-0">
                  <Link
                    href={item.href}
                    prefetch
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group inline-flex min-h-10 items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-medium whitespace-nowrap transition-[background-color,color] duration-300 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background md:min-h-0 md:py-1.5",
                      active
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                    )}
                  >
                    <Icon
                      className={cn(
                        "size-4 shrink-0 transition-colors",
                        active
                          ? "text-primary-foreground"
                          : "text-muted-foreground group-hover:text-foreground",
                      )}
                    />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
          {/* 右侧渐隐：提示还可横滑看到榜单等 */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-background via-background/80 to-transparent md:hidden"
          />
        </div>

        <form
          onSubmit={onSearch}
          className="flex w-full shrink-0 items-center gap-2 md:w-auto md:max-w-xs"
          role="search"
        >
          <label className="sr-only" htmlFor="community-search">
            搜索帖子
          </label>
          <div className="relative min-w-0 flex-1">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              key={`${pathname}:${query}`}
              id="community-search"
              name="q"
              defaultValue={query}
              placeholder="搜索标题、正文、标签"
              maxLength={100}
              className="h-10 w-full rounded-full border border-border bg-card/70 pr-3 pl-9 text-[13px] text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-foreground/30 focus-visible:ring-2 focus-visible:ring-ring md:h-9"
            />
          </div>
          <button
            type="submit"
            className="inline-flex h-10 shrink-0 items-center justify-center rounded-full bg-primary px-4 text-[12px] font-medium text-primary-foreground transition-[background-color,transform] duration-300 hover:-translate-y-px hover:bg-foreground/90 md:h-9 md:px-3.5"
          >
            搜索
          </button>
        </form>
      </nav>
    </div>
  );
}
