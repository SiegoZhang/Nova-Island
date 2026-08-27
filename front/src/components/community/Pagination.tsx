import Link from "next/link";

import { ChevronLeftIcon, ChevronRightIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface PaginationProps {
  page: number;
  totalPages: number;
  hrefForPage: (page: number) => string;
  className?: string;
}

/** 生成带省略号的页码窗口，避免页数过多撑破布局。 */
function buildPageItems(page: number, totalPages: number): (number | "ellipsis")[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const items: (number | "ellipsis")[] = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(totalPages - 1, page + 1);

  if (start > 2) items.push("ellipsis");
  for (let p = start; p <= end; p += 1) items.push(p);
  if (end < totalPages - 1) items.push("ellipsis");
  items.push(totalPages);
  return items;
}

export function Pagination({
  page,
  totalPages,
  hrefForPage,
  className,
}: PaginationProps) {
  if (totalPages <= 1) return null;

  const pages = buildPageItems(page, totalPages);

  return (
    <nav
      aria-label="分页"
      className={cn(
        "flex flex-wrap items-center justify-center gap-2",
        className,
      )}
    >
      {page <= 1 ? (
        <Button variant="outline" size="sm" disabled aria-label="上一页">
          <ChevronLeftIcon className="size-4" />
          上一页
        </Button>
      ) : (
        <Link
          href={hrefForPage(page - 1)}
          className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full border border-border bg-card/60 px-3.5 text-[12px] font-medium text-foreground transition-[background-color,border-color] duration-300 hover:border-foreground/25 hover:bg-card"
          aria-label="上一页"
        >
          <ChevronLeftIcon className="size-4" />
          上一页
        </Link>
      )}

      <ul className="flex max-w-full flex-wrap items-center justify-center gap-1">
        {pages.map((p, index) =>
          p === "ellipsis" ? (
            <li
              key={`e-${index}`}
              className="flex size-10 items-center justify-center text-[13px] text-muted-foreground"
              aria-hidden
            >
              …
            </li>
          ) : (
            <li key={p}>
              {p === page ? (
                <Button
                  size="icon"
                  variant="primary"
                  aria-current="page"
                  className="size-10 text-[13px]"
                >
                  {p}
                </Button>
              ) : (
                <Link
                  href={hrefForPage(p)}
                  className="inline-flex size-10 items-center justify-center rounded-full text-[13px] font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  {p}
                </Link>
              )}
            </li>
          ),
        )}
      </ul>

      {page >= totalPages ? (
        <Button variant="outline" size="sm" disabled aria-label="下一页">
          下一页
          <ChevronRightIcon className="size-4" />
        </Button>
      ) : (
        <Link
          href={hrefForPage(page + 1)}
          className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full border border-border bg-card/60 px-3.5 text-[12px] font-medium text-foreground transition-[background-color,border-color] duration-300 hover:border-foreground/25 hover:bg-card"
          aria-label="下一页"
        >
          下一页
          <ChevronRightIcon className="size-4" />
        </Link>
      )}
    </nav>
  );
}
