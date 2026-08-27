"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";

import { useAuth } from "@/components/auth/AuthProvider";
import { PageHeader } from "@/components/community/PageHeader";
import { Pagination } from "@/components/community/Pagination";
import { PostCard } from "@/components/community/PostCard";
import { ListSkeleton } from "@/components/community/skeletons";
import { FileTextIcon, InboxIcon } from "@/components/icons";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { withQuery } from "@/lib/format";
import { listMyDrafts } from "@/services/community/users";
import type { Post } from "@/types/community";

const PAGE_SIZE = 10;

function DraftsContent() {
  const { status } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const page = Math.max(1, Number(searchParams.get("page")) || 1);

  const [posts, setPosts] = useState<Post[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace(`/login?next=${encodeURIComponent("/drafts")}`);
    }
  }, [status, router]);

  const load = useCallback(async (nextPage: number) => {
    setLoading(true);
    setError(null);
    try {
      const data = await listMyDrafts({
        page: nextPage,
        pageSize: PAGE_SIZE,
      });
      setPosts(data.items);
      setTotalPages(data.pagination.totalPages);
    } catch {
      setPosts([]);
      setTotalPages(1);
      setError("草稿加载失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status !== "authenticated") return;
    void load(page);
  }, [status, page, load]);

  if (status !== "authenticated") {
    return (
      <div className="section-container w-full py-8 md:py-10">
        <Skeleton className="h-9 w-40" />
        <div className="mt-8">
          <Skeleton className="h-48 w-full rounded-[20px]" />
        </div>
      </div>
    );
  }

  return (
    <div className="section-container w-full py-8 md:py-10">
      <PageHeader
        title="我的草稿"
        description="未发布的内容只对你可见；完善后可从编辑页发布。"
        action={
          <Link
            href="/community/new"
            className="inline-flex h-10 items-center justify-center rounded-full bg-primary px-5 text-[13px] font-medium text-primary-foreground"
          >
            写新帖
          </Link>
        }
      />

      <div className="mt-8">
        {loading ? (
          <ListSkeleton count={4} />
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
        ) : posts.length === 0 ? (
          <EmptyState
            icon={<FileTextIcon className="size-6" />}
            title="还没有草稿"
            description="发帖时可先存草稿，稍后再回来继续写。"
            action={
              <Link
                href="/community/new"
                className="inline-flex h-10 items-center justify-center rounded-full bg-primary px-5 text-[13px] font-medium text-primary-foreground"
              >
                去写一篇
              </Link>
            }
          />
        ) : (
          <div className="flex flex-col gap-4">
            {posts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                href={`/community/${post.id}/edit`}
              />
            ))}
            <Pagination
              page={page}
              totalPages={totalPages}
              hrefForPage={(p) => withQuery("/drafts", { page: p })}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default function DraftsPage() {
  return (
    <Suspense
      fallback={
        <div className="section-container w-full py-8 md:py-10">
          <Skeleton className="h-9 w-40" />
          <div className="mt-8">
            <Skeleton className="h-48 w-full rounded-[20px]" />
          </div>
        </div>
      }
    >
      <DraftsContent />
    </Suspense>
  );
}
