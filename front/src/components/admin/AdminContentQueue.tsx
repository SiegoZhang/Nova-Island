"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";

import { Pagination } from "@/components/community/Pagination";
import { ListSkeleton } from "@/components/community/skeletons";
import { InboxIcon } from "@/components/icons";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { formatRelative, withQuery } from "@/lib/format";
import { ApiClientError } from "@/services/api/errors";
import {
  deletePost,
  featurePost,
  hidePost,
  listAdminPosts,
  unfeaturePost,
  unhidePost,
} from "@/services/community/posts";
import type { Post, PostStatus } from "@/types/community";

const PAGE_SIZE = 10;

type QueueTab = "hidden" | "published" | "featured";

const tabs: { id: QueueTab; label: string; hint: string }[] = [
  { id: "hidden", label: "已隐藏", hint: "前台不可见，可恢复或删除" },
  { id: "published", label: "已发布", hint: "可加精、隐藏或删除" },
  { id: "featured", label: "精华", hint: "已加精的已发布内容" },
];

function statusLabel(status: PostStatus): string {
  if (status === "hidden") return "已隐藏";
  if (status === "published") return "已发布";
  if (status === "draft") return "草稿";
  return "已删除";
}

function AdminContentQueueInner() {
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const tab: QueueTab =
    tabParam === "published" || tabParam === "featured" ? tabParam : "hidden";
  const page = Math.max(1, Number(searchParams.get("page") || "1") || 1);

  const [items, setItems] = useState<Post[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listAdminPosts({
        page,
        pageSize: PAGE_SIZE,
        status: tab === "hidden" ? "hidden" : "published",
        featured: tab === "featured" ? true : undefined,
      });
      setItems(data.items);
      setTotalPages(data.pagination.totalPages);
      setTotal(data.pagination.total);
    } catch (cause) {
      setItems([]);
      setTotalPages(1);
      setTotal(0);
      setError(
        cause instanceof ApiClientError
          ? cause.message
          : "加载失败，请稍后重试",
      );
    } finally {
      setLoading(false);
    }
  }, [page, tab]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (postId: string, action: () => Promise<void>) => {
    setBusyId(postId);
    setError(null);
    try {
      await action();
      await load();
    } catch (cause) {
      setError(
        cause instanceof ApiClientError
          ? cause.message
          : "操作失败，请稍后重试",
      );
    } finally {
      setBusyId(null);
    }
  };

  const hrefForTab = (next: QueueTab) =>
    withQuery("/admin/content", { tab: next === "hidden" ? undefined : next });

  const hrefForPage = (nextPage: number) =>
    withQuery("/admin/content", {
      tab: tab === "hidden" ? undefined : tab,
      page: nextPage,
    });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {tabs.map((item) => {
          const active = item.id === tab;
          return (
            <Link
              key={item.id}
              href={hrefForTab(item.id)}
              className={
                active
                  ? "inline-flex h-9 items-center rounded-full bg-primary px-4 text-[13px] font-medium text-primary-foreground"
                  : "inline-flex h-9 items-center rounded-full border border-border bg-card/60 px-4 text-[13px] font-medium text-muted-foreground transition-colors hover:border-foreground/25 hover:text-foreground"
              }
            >
              {item.label}
            </Link>
          );
        })}
      </div>

      <p className="text-[13px] text-muted-foreground">
        {tabs.find((item) => item.id === tab)?.hint}
        {total > 0 ? ` · 共 ${total} 条` : null}
        。详情页「内容管理」仍可即时审帖。
      </p>

      {error ? (
        <p role="alert" className="text-[13px] text-destructive">
          {error}
        </p>
      ) : null}

      {loading ? (
        <ListSkeleton count={4} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<InboxIcon className="size-5" />}
          title={tab === "hidden" ? "暂无隐藏内容" : "暂无匹配内容"}
          description={
            tab === "hidden"
              ? "领航员或管理员隐藏帖子后，会出现在这里。"
              : "换一个标签看看，或去社区处理。"
          }
        />
      ) : (
        <ul className="divide-y divide-border rounded-2xl border border-border bg-card/40">
          {items.map((post) => {
            const busy = busyId === post.id;
            return (
              <li
                key={post.id}
                className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/community/${encodeURIComponent(post.id)}`}
                      className="truncate text-[15px] font-semibold tracking-[-0.01em] text-foreground transition-colors hover:text-primary"
                    >
                      {post.title}
                    </Link>
                    <Badge variant="muted">{statusLabel(post.status)}</Badge>
                    {post.isFeatured ? (
                      <Badge variant="default">精华</Badge>
                    ) : null}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
                    <Avatar
                      src={post.author.avatarUrl}
                      name={post.author.displayName}
                      size={24}
                    />
                    <span>{post.author.displayName}</span>
                    <span>·</span>
                    <span>
                      更新于{" "}
                      {formatRelative(post.updatedAt || post.createdAt)}
                    </span>
                    {post.tags.length > 0 ? (
                      <>
                        <span>·</span>
                        <span className="truncate">
                          {post.tags.slice(0, 3).join(" / ")}
                        </span>
                      </>
                    ) : null}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 sm:shrink-0">
                  <Link
                    href={`/community/${encodeURIComponent(post.id)}`}
                    className="inline-flex h-8 items-center justify-center rounded-full border border-border bg-card/60 px-3.5 text-[12px] font-medium text-foreground transition-colors hover:border-foreground/25 hover:bg-card"
                  >
                    查看
                  </Link>

                  {post.status === "hidden" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        void run(post.id, async () => {
                          await unhidePost(post.id);
                        })
                      }
                    >
                      恢复
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        void run(post.id, async () => {
                          await hidePost(post.id);
                        })
                      }
                    >
                      隐藏
                    </Button>
                  )}

                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy || post.status === "hidden"}
                    onClick={() =>
                      void run(post.id, async () => {
                        if (post.isFeatured) {
                          await unfeaturePost(post.id);
                        } else {
                          await featurePost(post.id);
                        }
                      })
                    }
                  >
                    {post.isFeatured ? "取消加精" : "加精"}
                  </Button>

                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() =>
                      void run(post.id, async () => {
                        if (
                          !window.confirm(
                            "确认删除这篇内容？此操作不可恢复。",
                          )
                        ) {
                          return;
                        }
                        await deletePost(post.id);
                      })
                    }
                  >
                    删除
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Pagination
        page={page}
        totalPages={totalPages}
        hrefForPage={hrefForPage}
      />
    </div>
  );
}

export function AdminContentQueue() {
  return (
    <Suspense fallback={<ListSkeleton count={4} />}>
      <AdminContentQueueInner />
    </Suspense>
  );
}
