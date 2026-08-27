"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

export interface TagFilterItem {
  label: string;
  href: string;
  active: boolean;
}

interface TagFilterBarProps {
  items: TagFilterItem[];
  className?: string;
  /** 无障碍名称 */
  ariaLabel?: string;
}

/**
 * 帖子标签筛选：固定两行、横向滑动、右侧渐隐（移动端与桌面一致）。
 */
export function TagFilterBar({
  items,
  className,
  ariaLabel = "标签筛选",
}: TagFilterBarProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const active = scroller.querySelector<HTMLElement>("[data-active='true']");
    active?.scrollIntoView({
      inline: "nearest",
      block: "nearest",
      behavior: "smooth",
    });
  }, [items]);

  if (items.length <= 1) return null;

  return (
    <div className={cn("relative", className)}>
      <div
        ref={scrollerRef}
        className="overflow-x-auto overscroll-x-contain scroll-smooth [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {/*
          flex-col + flex-wrap + 固定高度：标签按列填满两行，超出部分横向滑。
          行高按 min-h-10 chip + gap-2 估算。
        */}
        <nav
          aria-label={ariaLabel}
          className="flex h-[5.5rem] w-max flex-col flex-wrap content-start gap-2 pr-8"
        >
          {items.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              data-active={item.active ? "true" : undefined}
              aria-current={item.active ? "page" : undefined}
              className={cn(
                "inline-flex min-h-10 shrink-0 items-center justify-center rounded-full px-3.5 text-[12px] font-medium whitespace-nowrap transition-[background-color,border-color,color] duration-300",
                item.active
                  ? "bg-primary text-primary-foreground"
                  : "border border-border bg-card/60 text-foreground hover:border-foreground/25 hover:bg-card",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-background via-background/85 to-transparent"
      />
    </div>
  );
}
