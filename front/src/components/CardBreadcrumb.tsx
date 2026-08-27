import { cn } from "@/lib/utils";

interface CardBreadcrumbProps {
  currentIndex: number;
  total: number;
  onSelect: (index: number) => void;
  tone?: "dark" | "light";
  className?: string;
}

export function CardBreadcrumb({
  currentIndex,
  total,
  onSelect,
  tone = "dark",
  className,
}: CardBreadcrumbProps) {
  const isDark = tone === "dark";

  return (
    <nav aria-label="卡片进度" className={cn("flex items-center gap-1.5", className)}>
      {Array.from({ length: total }, (_, index) => {
        const isCurrent = index === currentIndex;

        return (
          <button
            key={index}
            type="button"
            aria-label={`查看第 ${index + 1} 张卡片`}
            aria-current={isCurrent ? "step" : undefined}
            onClick={(event) => {
              event.stopPropagation();
              if (isCurrent) return;
              onSelect(index);
            }}
            className={cn(
              "h-1.5 rounded-full transition-[width,background-color] duration-300 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none",
              isCurrent ? "w-5" : "w-1.5",
              isDark
                ? isCurrent
                  ? "bg-white"
                  : "bg-white/30 hover:bg-white/55"
                : isCurrent
                  ? "bg-[#1c1917]"
                  : "bg-[#1c1917]/25 hover:bg-[#1c1917]/45",
              isDark
                ? "focus-visible:ring-offset-[#1c1917]"
                : "focus-visible:ring-offset-[#fdfcfc]",
            )}
          />
        );
      })}
    </nav>
  );
}
