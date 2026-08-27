import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type DivProps = HTMLAttributes<HTMLDivElement>;

export function Card({ className, ...props }: DivProps) {
  return (
    <div
      className={cn(
        "rounded-[20px] border border-border bg-card text-card-foreground shadow-[0_8px_28px_rgba(21,23,25,0.04)]",
        className,
      )}
      {...props}
    />
  );
}

/**
 * 可交互卡片：附带 hover/focus 抬升动效，供列表/网格中的可点击条目复用。
 */
export function InteractiveCard({ className, ...props }: DivProps) {
  return (
    <Card
      className={cn(
        "group transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-1 hover:border-foreground/10 hover:shadow-[0_18px_42px_rgba(21,23,25,0.09)] focus-within:-translate-y-1 focus-within:shadow-[0_18px_42px_rgba(21,23,25,0.09)]",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: DivProps) {
  return <div className={cn("flex flex-col gap-1.5 p-5", className)} {...props} />;
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn(
        "text-[15px] font-semibold tracking-[-0.02em] text-foreground",
        className,
      )}
      {...props}
    />
  );
}

export function CardDescription({
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn("text-[13px] leading-6 text-muted-foreground", className)}
      {...props}
    />
  );
}

export function CardContent({ className, ...props }: DivProps) {
  return <div className={cn("p-5 pt-0", className)} {...props} />;
}

export function CardFooter({ className, ...props }: DivProps) {
  return (
    <div
      className={cn("flex items-center gap-3 p-5 pt-0", className)}
      {...props}
    />
  );
}
