"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";

import { DetailBackLink } from "@/components/community/DetailBackLink";
import { PageHeader } from "@/components/community/PageHeader";
import { Pagination } from "@/components/community/Pagination";
import { ListSkeleton } from "@/components/community/skeletons";
import { InboxIcon } from "@/components/icons";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { withQuery } from "@/lib/format";
import { ApiClientError } from "@/services/api/errors";
import {
  getUserProfile,
  listUserFollowers,
  listUserFollowing,
} from "@/services/community/users";
import type { UserSummary } from "@/types/community";

const PAGE_SIZE = 20;

type FollowKind = "followers" | "following";

const copy: Record<
  FollowKind,
  { title: string; emptyTitle: string; emptyDescription: string }
> = {
  followers: {
    title: "粉丝",
    emptyTitle: "还没有粉丝",
    emptyDescription: "有人关注后会出现在这里。",
  },
  following: {
    title: "关注",
    emptyTitle: "还没有关注任何人",
    emptyDescription: "去逛逛社区，关注感兴趣的岛民吧。",
  },
};

function FollowListContent({ kind }: { kind: FollowKind }) {
  const params = useParams<{ username: string }>();
  const username = params.username;
  const searchParams = useSearchParams();
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const meta = copy[kind];

  const [displayName, setDisplayName] = useState(username);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setNotFound(false);
    try {
      const [profile, list] = await Promise.all([
        getUserProfile(username),
        kind === "followers"
          ? listUserFollowers(username, { page, pageSize: PAGE_SIZE })
          : listUserFollowing(username, { page, pageSize: PAGE_SIZE }),
      ]);
      setDisplayName(profile.displayName);
      setUsers(list.items);
      setTotalPages(list.pagination.totalPages);
    } catch (cause) {
      if (cause instanceof ApiClientError && cause.status === 404) {
        setNotFound(true);
      }
      setUsers([]);
      setTotalPages(1);
    } finally {
      setLoading(false);
    }
  }, [username, kind, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const basePath = `/u/${username}/${kind}`;
  const otherKind: FollowKind =
    kind === "followers" ? "following" : "followers";

  if (notFound) {
    return (
      <div className="section-container w-full py-16">
        <EmptyState
          icon={<InboxIcon className="size-6" />}
          title="用户不存在"
          description="这个岛民可能还没有登岛，或者链接有误。"
          action={
            <Link
              href="/community"
              className="inline-flex h-10 items-center justify-center rounded-full bg-primary px-5 text-[13px] font-medium text-primary-foreground transition-[background-color,transform] duration-300 hover:-translate-y-px hover:bg-foreground/90"
            >
              返回社区
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="section-container w-full py-8 md:py-10">
      <div className="mb-4">
        <DetailBackLink
          fallbackHref={`/u/${username}`}
          label="返回主页"
        />
      </div>
      <PageHeader
        title={`${displayName} 的${meta.title}`}
        description={
          <Link
            href={`/u/${username}/${otherKind}`}
            className="text-foreground underline-offset-4 hover:underline"
          >
            查看{copy[otherKind].title}
          </Link>
        }
      />

      <div className="mt-8">
        {loading ? (
          <ListSkeleton count={5} />
        ) : users.length === 0 ? (
          <EmptyState
            icon={<InboxIcon className="size-6" />}
            title={meta.emptyTitle}
            description={meta.emptyDescription}
          />
        ) : (
          <>
            <ul className="divide-y divide-border overflow-hidden rounded-[20px] border border-border bg-card">
              {users.map((user) => (
                <li key={user.id}>
                  <Link
                    href={`/u/${user.username}`}
                    className="flex items-center gap-3 px-5 py-4 transition-colors hover:bg-secondary/50 focus-visible:bg-secondary/50 focus-visible:outline-none"
                  >
                    <Avatar
                      src={user.avatarUrl}
                      name={user.displayName}
                      size={40}
                    />
                    <div className="min-w-0 leading-tight">
                      <p className="truncate text-[14px] font-semibold text-foreground">
                        {user.displayName}
                      </p>
                      <p className="truncate text-[12px] text-muted-foreground">
                        @{user.username}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
            <Pagination
              page={page}
              totalPages={totalPages}
              hrefForPage={(p) => withQuery(basePath, { page: p })}
              className="pt-6"
            />
          </>
        )}
      </div>
    </div>
  );
}

export function FollowListPage({ kind }: { kind: FollowKind }) {
  return (
    <Suspense
      fallback={
        <div className="section-container w-full py-8 md:py-10">
          <Skeleton className="h-9 w-48" />
          <div className="mt-8">
            <Skeleton className="h-64 w-full rounded-[20px]" />
          </div>
        </div>
      }
    >
      <FollowListContent kind={kind} />
    </Suspense>
  );
}
