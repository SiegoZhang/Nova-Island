"use client";

import Link from "next/link";

import { useAuth } from "@/components/auth/AuthProvider";
import { PlusIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NEW_POST_PATH = "/community/new";
const LOGIN_NEXT = `/login?next=${encodeURIComponent(NEW_POST_PATH)}`;

interface ComposePostButtonProps {
  /** 已登录时的按钮文案 */
  label: string;
  /** 未登录文案；默认「登录后发布」，避免暗示无需登录即可发帖 */
  guestLabel?: string;
  className?: string;
}

export function ComposePostButton({
  label,
  guestLabel = "登录后发布",
  className,
}: ComposePostButtonProps) {
  const { status, isAuthenticated } = useAuth();

  if (status === "loading") {
    return (
      <Button size="md" disabled className={className}>
        <PlusIcon className="size-4" />
        {label}
      </Button>
    );
  }

  const href = isAuthenticated ? NEW_POST_PATH : LOGIN_NEXT;
  const text = isAuthenticated ? label : guestLabel;

  return (
    <Link
      href={href}
      className={cn(
        "inline-flex h-10 items-center justify-center gap-2 rounded-full bg-primary px-5 text-[13px] font-medium tracking-[0.01em] text-primary-foreground transition-[background-color,transform] duration-300 hover:-translate-y-px hover:bg-foreground/90",
        className,
      )}
    >
      <PlusIcon className="size-4" />
      {text}
    </Link>
  );
}
