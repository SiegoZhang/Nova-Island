import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type BadgeVariant = "default" | "accent" | "outline" | "muted";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const variantClasses: Record<BadgeVariant, string> = {
  default: "bg-primary text-primary-foreground",
  accent: "bg-accent/20 text-foreground",
  outline: "border border-border text-muted-foreground",
  muted: "bg-secondary text-secondary-foreground",
};

export function Badge({ className, variant = "muted", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium tracking-[0.01em]",
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  );
}
