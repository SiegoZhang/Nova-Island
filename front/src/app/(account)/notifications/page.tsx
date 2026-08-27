"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";

import { useAuth } from "@/components/auth/AuthProvider";
import { Pagination } from "@/components/community/Pagination";
import { InboxIcon } from "@/components/icons";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { formatRelative, withQuery } from "@/lib/format";
import { notificationHref, notificationMessage } from "@/lib/notifications";
import { cn } from "@/lib/utils";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/services/notifications";
import type { NotificationItem } from "@/types/notification";

const PAGE_SIZE = 20;

function NotificationsContent() {
  const { status } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const page = Math.max(1, Number(searchParams.get("page")) || 1);

  const [items, setItems] = useState<NotificationItem[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [marking, setMarking] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace(`/login?next=${encodeURIComponent("/notifications")}`);
    }
  }, [status, router]);

  const load = useCallback(async (nextPage: number) => {
    setLoading(true);
    setError(null);
    try {
      const data = await listNotifications({
        page: nextPage,
        pageSize: PAGE_SIZE,
      });
      setItems(data.items);
      setTotalPages(data.pagination.totalPages);
    } catch {
      setItems([]);
      setTotalPages(1);
      setError("通知加载失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status !== "authenticated") return;
    void load(page);
  }, [status, page, load]);

  const handleOpen = async (item: NotificationItem) => {
    if (!item.readAt) {
      try {
        await markNotificationRead(item.id);
        setItems((prev) =>
          prev.map((row) =>
            row.id === item.id
              ? { ...row, readAt: new Date().toISOString() }
              : row,
          ),
        );
      } catch {
        // 仍允许跳转
      }
    }
    router.push(notificationHref(item));
  };

  const handleReadAll = async () => {
    setMarking(true);
    try {
      await markAllNotificationsRead();
      setItems((prev) =>
        prev.map((row) => ({
          ...row,
          readAt: row.readAt ?? new Date().toISOString(),
        })),
      );
    } finally {
      setMarking(false);
    }
  };

  if (status === "loading" || status === "unauthenticated") {
    return (
      <div className="section-container w-full py-8 md:py-10">
        <Skeleton className="h-9 w-40" />
        <div className="mt-6 space-y-3">
          <Skeleton className="h-16 w-full rounded-2xl" />
          <Skeleton className="h-16 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  const hasUnread = items.some((item) => !item.readAt);

  return (
    <div className="section-container w-full py-8 md:py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            通知
          </h1>
          <p className="mt-2 text-[14px] text-muted-foreground">
            赞、评论、回复与关注会出现在这里。
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={marking || !hasUnread}
          onClick={handleReadAll}
        >
          {marking ? "处理中……" : "全部标为已读"}
        </Button>
      </div>

      <div className="mt-8">
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full rounded-2xl" />
            <Skeleton className="h-16 w-full rounded-2xl" />
            <Skeleton className="h-16 w-full rounded-2xl" />
          </div>
        ) : error ? (
          <EmptyState
            icon={<InboxIcon className="size-6" />}
            title="加载失败"
            description={error}
            action={
              <button
                type="button"
                onClick={() => void load(page)}
                className="inline-flex h-10 items-center justify-center rounded-full bg-primary px-5 text-[13px] font-medium text-primary-foreground"
              >
                重试
              </button>
            }
          />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<InboxIcon className="size-6" />}
            title="还没有通知"
            description="有人赞、评论、回复或关注你时，会显示在这里。"
            action={
              <Link
                href="/community"
                className="inline-flex h-10 items-center justify-center rounded-full bg-primary px-5 text-[13px] font-medium text-primary-foreground"
              >
                去社区看看
              </Link>
            }
          />
        ) : (
          <>
            <ul className="divide-y divide-border overflow-hidden rounded-[20px] border border-border bg-card">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => void handleOpen(item)}
                    className={cn(
                      "flex w-full items-start gap-3 px-5 py-4 text-left transition-colors hover:bg-secondary/50",
                      !item.readAt && "bg-secondary/40",
                    )}
                  >
                    <Avatar
                      src={item.actor.avatarUrl}
                      name={item.actor.displayName}
                      size={40}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] text-foreground">
                        <span className="font-semibold">
                          {item.actor.displayName}
                        </span>{" "}
                        <span className="text-muted-foreground">
                          {notificationMessage(item)}
                        </span>
                      </p>
                      <p className="mt-1 text-[12px] text-muted-foreground">
                        {formatRelative(item.createdAt)}
                        {!item.readAt ? " · 未读" : ""}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
            <Pagination
              page={page}
              totalPages={totalPages}
              hrefForPage={(p) => withQuery("/notifications", { page: p })}
              className="pt-6"
            />
          </>
        )}
      </div>
    </div>
  );
}

export default function NotificationsPage() {
  return (
    <Suspense
      fallback={
        <div className="section-container w-full py-8 md:py-10">
          <Skeleton className="h-9 w-40" />
          <Skeleton className="mt-6 h-40 w-full rounded-[20px]" />
        </div>
      }
    >
      <NotificationsContent />
    </Suspense>
  );
}
