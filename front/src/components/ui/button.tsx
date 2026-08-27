import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "destructive";
type ButtonSize = "sm" | "md" | "lg" | "icon";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-primary text-primary-foreground hover:-translate-y-px hover:bg-foreground/90",
  secondary:
    "bg-secondary text-secondary-foreground hover:bg-secondary/70",
  outline:
    "border border-border bg-card/60 text-foreground backdrop-blur hover:border-foreground/25 hover:bg-card",
  ghost: "text-muted-foreground hover:bg-secondary hover:text-foreground",
  destructive:
    "border border-destructive/25 bg-destructive/8 text-destructive hover:bg-destructive/12",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-8 gap-1.5 rounded-full px-3.5 text-[12px]",
  md: "h-10 gap-2 rounded-full px-5 text-[13px]",
  lg: "h-12 gap-2 rounded-full px-7 text-[14px]",
  icon: "size-10 rounded-full",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", type, ...props }, ref) => {
    return (
      <button
        ref={ref}
        type={type ?? "button"}
        className={cn(
          "inline-flex items-center justify-center font-medium tracking-[0.01em] whitespace-nowrap transition-[background-color,transform,border-color,color] duration-300 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-45",
          variantClasses[variant],
          sizeClasses[size],
          className,
        )}
        {...props}
      />
    );
  },
);

Button.displayName = "Button";
