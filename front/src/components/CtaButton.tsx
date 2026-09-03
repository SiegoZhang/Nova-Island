import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * 全站统一 CTA 胶囊按钮。
 *
 * 造型基准 = 首页悬浮导航里的「加入岛屿」：rounded-full 纯黑胶囊 / 白字 /
 * font-medium / active 轻微回弹。所有首页 CTA 都用这一个组件，避免出现
 * 蓝胶囊、白方块、mono 大写按钮等各说各话的样式。
 *
 * 语境反相：
 *   - onDark = false（浅色底：Hero、导航）  → 黑胶囊 / 白字
 *   - onDark = true （深色底：星空卡片）    → 白胶囊 / 近黑字（保证对比度）
 *
 * 尺寸：
 *   - sm  导航胶囊
 *   - md  页面区块主按钮（移动端略收，桌面 px-6/py-3）
 */

type Variant = "solid" | "ghost";
type Size = "sm" | "md";

type CtaButtonProps = {
  href: string;
  children: ReactNode;
  variant?: Variant;
  /** 是否位于深色底之上（星空卡片）。solid 反相为白胶囊，ghost 文字转白。 */
  onDark?: boolean;
  size?: Size;
  className?: string;
} & Omit<ComponentProps<typeof Link>, "href" | "className" | "children">;

const BASE =
  "inline-flex items-center justify-center rounded-full font-medium tracking-[-0.01em] whitespace-nowrap transition-[background-color,color,opacity,transform] duration-200 ease-out active:scale-[0.97]";

const SIZE: Record<Size, string> = {
  sm: "px-4 py-1.5 text-[12px]",
  md: "px-5 py-2.5 text-[13px] sm:px-6 sm:py-3 sm:text-[14px]",
};

const GHOST_SIZE: Record<Size, string> = {
  sm: "px-1 text-[12px]",
  md: "px-1 text-[13px] sm:text-[14px]",
};

function toneClasses(variant: Variant, onDark: boolean): string {
  if (variant === "ghost") {
    return onDark
      ? "text-white/80 hover:text-white"
      : "text-[#222] hover:opacity-60";
  }
  return onDark
    ? "bg-white text-[#141414] hover:bg-white/90"
    : "bg-[#111] text-white hover:bg-black";
}

export function CtaButton({
  href,
  children,
  variant = "solid",
  onDark = false,
  size = "md",
  className,
  ...linkProps
}: CtaButtonProps) {
  return (
    <Link
      href={href}
      className={cn(
        BASE,
        variant === "ghost" ? GHOST_SIZE[size] : SIZE[size],
        toneClasses(variant, onDark),
        className,
      )}
      {...linkProps}
    >
      {children}
    </Link>
  );
}
