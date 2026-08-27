"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { useAuth } from "@/components/auth/AuthProvider";
import { ComposePostButton } from "@/components/community/ComposePostButton";
import { DetailBackLink } from "@/components/community/DetailBackLink";
import { PostCard } from "@/components/community/PostCard";
import { ListSkeleton } from "@/components/community/skeletons";
import { InboxIcon } from "@/components/icons";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCount } from "@/lib/format";
import { isAdmin } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { ApiClientError } from "@/services/api/errors";
import {
  followUser,
  getUserProfile,
  listMyDrafts,
  listUserBookmarks,
  listUserPosts,
  unfollowUser,
} from "@/services/community/users";
import type { Post } from "@/types/community";
import type { UserProfile } from "@/types/user";

const PROFILE_POSTS_PAGE_SIZE = 10;

type ProfileTab = "posts" | "featured" | "bookmarks" | "drafts";

const BASE_TABS: { id: ProfileTab; label: string }[] = [
  { id: "posts", label: "全部" },
  { id: "featured", label: "精华" },
  { id: "bookmarks", label: "收藏" },
];

const roleLabels: Record<string, string> = {
  admin: "管理员",
  moderator: "领航员",
  member: "岛民",
};

function StatItem({
  label,
  value,
  href,
  emphasize,
}: {
  label: string;
  value: number;
  href?: string;
  emphasize?: boolean;
}) {
  const body = (
    <>
      <p
        className={cn(
          "text-[18px] font-bold tabular-nums text-foreground transition-colors",
          emphasize && "text-accent",
        )}
      >
        {formatCount(value)}
      </p>
      <p className="text-[12px] text-muted-foreground">{label}</p>
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="rounded-lg text-center outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring"
      >
        {body}
      </Link>
    );
  }

  return <div className="text-center">{body}</div>;
}

export default function UserProfilePage() {
  const params = useParams<{ username: string }>();
  const username = params.username;
  const { user: viewer, isAuthenticated, status: authStatus } = useAuth();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [tab, setTab] = useState<ProfileTab>("posts");
  const [posts, setPosts] = useState<Post[]>([]);
  const [postsLoading, setPostsLoading] = useState(true);
  const [postsLoadingMore, setPostsLoadingMore] = useState(false);
  const [postsError, setPostsError] = useState<string | null>(null);
  const [postsPage, setPostsPage] = useState(1);
  const [postsTotal, setPostsTotal] = useState(0);
  const [postsHasMore, setPostsHasMore] = useState(false);
  const [followPending, setFollowPending] = useState(false);
  const [followError, setFollowError] = useState<string | null>(null);
  const [followerPulse, setFollowerPulse] = useState(false);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setNotFound(false);
    setProfileError(null);
    try {
      const data = await getUserProfile(username);
      setProfile(data);
    } catch (cause) {
      setProfile(null);
      if (cause instanceof ApiClientError && cause.status === 404) {
        setNotFound(true);
      } else {
        setProfileError(
          cause instanceof ApiClientError
            ? cause.message
            : "资料加载失败，请稍后重试",
        );
      }
    } finally {
      setLoading(false);
    }
  }, [username]);

  const loadFeed = useCallback(
    async (page = 1, append = false, activeTab: ProfileTab = tab) => {
      if (append) {
        setPostsLoadingMore(true);
      } else {
        setPostsLoading(true);
      }
      setPostsError(null);
      try {
        const data =
          activeTab === "drafts"
            ? await listMyDrafts({
                page,
                pageSize: PROFILE_POSTS_PAGE_SIZE,
              })
            : activeTab === "bookmarks"
            ? await listUserBookmarks(username, {
                page,
                pageSize: PROFILE_POSTS_PAGE_SIZE,
              })
            : await listUserPosts(username, {
                page,
                pageSize: PROFILE_POSTS_PAGE_SIZE,
                featured: activeTab === "featured" ? true : undefined,
              });
        setPosts((prev) =>
          append ? [...prev, ...data.items] : data.items,
        );
        setPostsPage(data.pagination.page);
        setPostsTotal(data.pagination.total);
        setPostsHasMore(data.pagination.page < data.pagination.totalPages);
      } catch (cause) {
        if (!append) {
          setPosts([]);
          setPostsTotal(0);
          setPostsHasMore(false);
        }
        setPostsError(
          cause instanceof ApiClientError
            ? cause.message
            : "内容加载失败，请稍后重试",
        );
      } finally {
        setPostsLoading(false);
        setPostsLoadingMore(false);
      }
    },
    [username, tab],
  );

  useEffect(() => {
    if (authStatus === "loading") return;
    void loadProfile();
  }, [loadProfile, authStatus]);

  useEffect(() => {
    void loadFeed(1, false, tab);
  }, [loadFeed, tab]);

  const handleToggleFollow = async () => {
    if (!profile) return;
    setFollowPending(true);
    setFollowError(null);
    try {
      const next = profile.isFollowing
        ? await unfollowUser(username)
        : await followUser(username);
      setProfile({
        ...profile,
        isFollowing: next.following,
        followerCount: next.followerCount,
      });
      setFollowerPulse(true);
      window.setTimeout(() => setFollowerPulse(false), 700);
    } catch (cause) {
      setFollowError(
        cause instanceof ApiClientError
          ? cause.message
          : "操作失败，请稍后重试",
      );
    } finally {
      setFollowPending(false);
    }
  };

  const tabTitle =
    tab === "drafts"
      ? "我的草稿"
      : tab === "bookmarks"
      ? profile?.isSelf
        ? "我的收藏"
        : "TA 的收藏"
      : tab === "featured"
        ? profile?.isSelf
          ? "我的精华"
          : "TA 的精华"
        : profile?.isSelf
          ? "我的帖子"
          : "TA 的帖子";

  const tagListBase = tab === "featured" ? "/community" : "/community/latest";
  const visibleTabs = profile?.isSelf
    ? [...BASE_TABS, { id: "drafts" as const, label: "草稿" }]
    : BASE_TABS;

  useEffect(() => {
    if (profile && !profile.isSelf && tab === "drafts") {
      setTab("posts");
    }
  }, [profile, tab]);

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

  if (!loading && profileError) {
    return (
      <div className="section-container w-full py-16">
        <EmptyState
          icon={<InboxIcon className="size-6" />}
          title="加载失败"
          description={profileError}
          action={
            <button
              type="button"
              onClick={() => void loadProfile()}
              className="inline-flex h-10 items-center justify-center rounded-full bg-primary px-5 text-[13px] font-medium text-primary-foreground transition-[background-color,transform] duration-300 hover:-translate-y-px hover:bg-foreground/90"
            >
              重试
            </button>
          }
        />
      </div>
    );
  }

  return (
    <div className="section-container w-full py-8 md:py-10">
      <div className="mb-4">
        <DetailBackLink fallbackHref="/community" label="返回上一页" />
      </div>

      {loading || !profile ? (
        <div className="flex flex-col gap-6 rounded-3xl border border-border bg-card p-6 sm:flex-row sm:items-center sm:p-8">
          <Skeleton className="size-20 rounded-full" />
          <div className="flex-1 space-y-3">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-64 max-w-full" />
            <Skeleton className="h-4 w-52 max-w-full" />
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-6 rounded-3xl border border-border bg-card p-6 shadow-[0_12px_40px_rgba(21,23,25,0.05)] sm:flex-row sm:items-start sm:p-8">
          <Avatar
            src={profile.avatarUrl}
            name={profile.displayName}
            size={80}
            className="size-20"
          />
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                {profile.displayName}
              </h1>
              <Badge variant="muted">
                {roleLabels[profile.role] ?? profile.role}
              </Badge>
            </div>
            <p className="mt-1 text-[13px] text-muted-foreground">
              @{profile.username}
            </p>
            {profile.bio ? (
              <p className="mt-3 max-w-xl text-[14px] leading-6 text-foreground/85">
                {profile.bio}
              </p>
            ) : null}

            <div
              className="mt-5 flex items-center gap-8"
              aria-live="polite"
            >
              <StatItem label="帖子" value={profile.postCount} />
              <StatItem
                label="粉丝"
                value={profile.followerCount}
                href={`/u/${username}/followers`}
                emphasize={followerPulse}
              />
              <StatItem
                label="关注"
                value={profile.followingCount}
                href={`/u/${username}/following`}
              />
            </div>
          </div>

          <div className="sm:self-center">
            {profile.isSelf ? (
              <div className="flex flex-wrap gap-2">
                <Link
                  href="/community/following"
                  className="inline-flex h-10 items-center justify-center rounded-full border border-border bg-card/60 px-5 text-[13px] font-medium text-foreground transition-colors duration-300 hover:border-foreground/25 hover:bg-card"
                >
                  关注动态
                </Link>
                <Link
                  href="/settings"
                  className="inline-flex h-10 items-center justify-center rounded-full border border-border bg-card/60 px-5 text-[13px] font-medium text-foreground transition-colors duration-300 hover:border-foreground/25 hover:bg-card"
                >
                  编辑资料
                </Link>
              </div>
            ) : isAuthenticated ? (
              <div className="flex flex-col items-stretch gap-2 sm:items-end">
                <Button
                  variant={profile.isFollowing ? "outline" : "primary"}
                  onClick={handleToggleFollow}
                  disabled={followPending}
                >
                  {profile.isFollowing ? "已关注" : "关注"}
                </Button>
                {followError ? (
                  <p role="alert" className="text-[12px] text-destructive">
                    {followError}
                  </p>
                ) : null}
              </div>
            ) : (
              <Link
                href={`/login?next=${encodeURIComponent(`/u/${username}`)}`}
                className="inline-flex h-10 items-center justify-center rounded-full bg-primary px-5 text-[13px] font-medium text-primary-foreground transition-[background-color,transform] duration-300 hover:-translate-y-px hover:bg-foreground/90"
              >
                登录后关注
              </Link>
            )}
          </div>
        </div>
      )}

      {profile && isAdmin(viewer?.role) && !profile.isSelf ? (
        <div className="mt-6 rounded-2xl border border-dashed border-border bg-secondary/40 px-4 py-3">
          <p className="text-[12px] font-medium text-muted-foreground">
            管理员
          </p>
          <p className="mt-1 text-[13px] leading-6 text-muted-foreground">
            调整角色或停用账号请前往管理后台，避免与社区前台操作混在一起。
          </p>
          <Link
            href={`/admin/users?q=${encodeURIComponent(profile.username)}`}
            className="mt-3 inline-flex h-9 items-center justify-center rounded-full bg-primary px-4 text-[12px] font-medium text-primary-foreground transition-[background-color,transform] duration-300 hover:-translate-y-px hover:bg-foreground/90"
          >
            在管理后台处理 @{profile.username}
          </Link>
        </div>
      ) : null}

      <div className="mx-auto mt-10 w-full max-w-3xl">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-[18px] font-semibold tracking-[-0.01em] text-foreground">
              {tabTitle}
            </h2>
            <p className="mt-1 text-[13px] text-muted-foreground">
              {postsLoading
                ? "正在加载…"
                : postsTotal > 0
                  ? `共 ${formatCount(postsTotal)} 篇`
                  : "暂无内容"}
            </p>
          </div>
          {profile?.isSelf && tab !== "bookmarks" && tab !== "drafts" ? (
            <ComposePostButton label="写新帖" />
          ) : null}
        </div>

        <div
          className="mt-4 flex flex-wrap items-center gap-2"
          role="tablist"
          aria-label="主页内容筛选"
        >
          {visibleTabs.map((item) => {
            const active = item.id === tab;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(item.id)}
                className={cn(
                  "inline-flex min-h-10 items-center justify-center rounded-full px-3.5 text-[12px] font-medium transition-[background-color,border-color,color] duration-300",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "border border-border bg-card/60 text-foreground hover:border-foreground/25 hover:bg-card",
                )}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        <div className="mt-5">
          {postsLoading ? (
            <ListSkeleton count={4} />
          ) : postsError ? (
            <EmptyState
              icon={<InboxIcon className="size-6" />}
              title="加载失败"
              description={postsError}
              action={
                <button
                  type="button"
                  onClick={() => void loadFeed(1, false, tab)}
                  className="inline-flex h-10 items-center justify-center rounded-full bg-primary px-5 text-[13px] font-medium text-primary-foreground transition-[background-color,transform] duration-300 hover:-translate-y-px hover:bg-foreground/90"
                >
                  重试
                </button>
              }
            />
          ) : posts.length === 0 ? (
            <EmptyState
              icon={<InboxIcon className="size-6" />}
              title={
                tab === "drafts"
                  ? "还没有草稿"
                  : tab === "bookmarks"
                  ? "还没有收藏"
                  : tab === "featured"
                    ? "还没有精华"
                    : "还没有发布内容"
              }
              description={
                tab === "drafts"
                  ? "发帖时可先存草稿，完善后再发布。"
                  : tab === "bookmarks"
                  ? profile?.isSelf
                    ? "在帖子详情点收藏，会出现在这里，也会对其他岛民公开。"
                    : "这位岛民还没有公开收藏。"
                  : tab === "featured"
                    ? profile?.isSelf
                      ? "被加精的帖子会出现在这里。"
                      : "这位岛民还没有被加精的内容。"
                    : profile?.isSelf
                      ? "写下你的第一篇动态，发布后会出现在「最新」和你的主页。"
                      : "这位岛民还没有公开内容。"
              }
              action={
                profile?.isSelf && (tab === "posts" || tab === "drafts") ? (
                  <ComposePostButton label="去发布" />
                ) : undefined
              }
            />
          ) : (
            <div className="flex flex-col gap-4">
              {posts.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  variant="list"
                  hideAuthor={tab !== "bookmarks"}
                  tagListBase={tagListBase}
                  href={
                    tab === "drafts"
                      ? `/community/${post.id}/edit`
                      : undefined
                  }
                />
              ))}
              {postsHasMore ? (
                <div className="flex justify-center pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={postsLoadingMore}
                    onClick={() => void loadFeed(postsPage + 1, true, tab)}
                  >
                    {postsLoadingMore ? "加载中…" : "加载更多"}
                  </Button>
                </div>
              ) : postsTotal > PROFILE_POSTS_PAGE_SIZE ? (
                <p className="pt-1 text-center text-[12px] text-muted-foreground">
                  已显示全部 {formatCount(postsTotal)} 篇
                </p>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
