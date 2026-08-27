import Link from "next/link";

import { ChatIcon, EyeIcon, HeartIcon } from "@/components/icons";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { InteractiveCard } from "@/components/ui/card";
import { formatCount, formatRelative, withQuery } from "@/lib/format";
import { resolveMediaUrl } from "@/lib/media";
import { cn } from "@/lib/utils";
import type { Post } from "@/types/community";

interface PostCardProps {
  post: Post;
  variant?: "grid" | "list";
  /** 个人主页等场景：作者信息已在页头展示时可隐藏 */
  hideAuthor?: boolean;
  /**
   * 标签点击跳转的列表基路径（按页面语境传入）。
   * 未传时按帖子是否精华落到 /community 或 /community/latest。
   */
  tagListBase?: string;
  /** 覆盖默认详情链接（如草稿列表跳编辑页） */
  href?: string;
}

function MetaRow({ post }: { post: Post }) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-[12px] text-muted-foreground">
      <span className="inline-flex items-center gap-1">
        <HeartIcon className="size-3.5" />
        {formatCount(post.likeCount)}
      </span>
      <span className="inline-flex items-center gap-1">
        <ChatIcon className="size-3.5" />
        {formatCount(post.commentCount)}
      </span>
      <span className="inline-flex items-center gap-1">
        <EyeIcon className="size-3.5" />
        {formatCount(post.viewCount)}
      </span>
    </div>
  );
}

function cleanExcerpt(excerpt: string | null | undefined): string | null {
  if (!excerpt) return null;
  const cleaned = excerpt
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || null;
}

function resolveTagListBase(post: Post, tagListBase?: string): string {
  if (tagListBase) return tagListBase;
  return post.isFeatured ? "/community" : "/community/latest";
}

/**
 * 社区列表卡：左文右图（无封面则通栏文字），对标常见社区信息流。
 */
export function PostCard({
  post,
  variant = "list",
  hideAuthor = false,
  tagListBase,
  href,
}: PostCardProps) {
  const publishedLabel = post.publishedAt
    ? formatRelative(post.publishedAt)
    : "草稿";
  const coverSrc = resolveMediaUrl(post.coverImageUrl);
  const excerpt = cleanExcerpt(post.excerpt);
  const isList = variant === "list";
  const listBase = resolveTagListBase(post, tagListBase);
  const detailHref = href ?? `/community/${post.id}`;

  return (
    <InteractiveCard className={cn(isList ? "p-4 sm:p-5" : "flex h-full flex-col p-5")}>
      <div
        className={cn(
          "gap-3 sm:gap-4",
          isList && coverSrc
            ? "flex flex-row items-stretch"
            : "flex h-full flex-col",
        )}
      >
        <div className="flex min-w-0 flex-1 flex-col">
          {post.tags.length > 0 || post.isFeatured ? (
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              {post.isFeatured ? (
                <Link
                  href="/community"
                  className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Badge variant="accent">精华</Badge>
                </Link>
              ) : null}
              {post.tags.slice(0, isList ? 3 : 2).map((tag) => (
                <Link
                  key={tag}
                  href={withQuery(listBase, { tag, page: 1 })}
                  className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Badge variant="accent">{tag}</Badge>
                </Link>
              ))}
            </div>
          ) : null}

          <Link
            href={detailHref}
            className="block rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {!isList && coverSrc ? (
              <div className="mb-3 aspect-[16/9] overflow-hidden rounded-xl bg-secondary/40">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={coverSrc}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                />
              </div>
            ) : null}

            <h3
              className={cn(
                "font-semibold tracking-[-0.02em] text-foreground transition-colors hover:text-primary",
                isList
                  ? "text-[16px] leading-6 sm:text-[17px] sm:leading-7"
                  : "text-[15px] leading-6 line-clamp-2",
              )}
            >
              {post.title}
            </h3>

            {excerpt ? (
              <p
                className={cn(
                  "mt-2 text-[13px] leading-6 text-muted-foreground",
                  isList ? "line-clamp-2 sm:line-clamp-3" : "line-clamp-2",
                )}
              >
                {excerpt}
              </p>
            ) : null}
          </Link>

          <div
            className={cn(
              "mt-3 flex flex-wrap items-center gap-3",
              hideAuthor ? "justify-between" : "justify-between",
              !isList && "mt-auto pt-3",
            )}
          >
            {hideAuthor ? (
              <p className="text-[12px] text-muted-foreground">
                {publishedLabel}
              </p>
            ) : (
              <Link
                href={`/u/${post.author.username}`}
                className="flex items-center gap-2 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Avatar
                  src={post.author.avatarUrl}
                  name={post.author.displayName}
                  size={28}
                />
                <div className="leading-tight">
                  <p className="text-[12px] font-medium text-foreground transition-colors hover:text-primary">
                    {post.author.displayName}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {publishedLabel}
                  </p>
                </div>
              </Link>
            )}
            <MetaRow post={post} />
          </div>
        </div>

        {isList && coverSrc ? (
          <Link
            href={detailHref}
            className={cn(
              "relative shrink-0 overflow-hidden rounded-xl bg-secondary/40 outline-none focus-visible:ring-2 focus-visible:ring-ring",
              "h-[4.5rem] w-[4.5rem] sm:h-[7.5rem] sm:w-[10.5rem] lg:h-[8.25rem] lg:w-[12rem]",
            )}
            aria-label={post.title}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={coverSrc}
              alt=""
              loading="lazy"
              decoding="async"
              className="size-full object-cover"
            />
          </Link>
        ) : null}
      </div>
    </InteractiveCard>
  );
}
