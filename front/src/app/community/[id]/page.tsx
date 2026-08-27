import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";

import { Breadcrumb } from "@/components/community/Breadcrumb";
import { CommentSection } from "@/components/community/CommentSection";
import { DetailBackLink } from "@/components/community/DetailBackLink";
import { MarkdownContent } from "@/components/community/MarkdownContent";
import { PostAttachments } from "@/components/community/PostAttachments";
import { PostModerationBar } from "@/components/community/PostModerationBar";
import { PostReactionBar } from "@/components/community/PostReactionBar";
import { ChatIcon, HeartIcon } from "@/components/icons";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { formatCount, formatRelative, withQuery } from "@/lib/format";
import { ApiClientError } from "@/services/api/errors";
import { serverApiOptions } from "@/services/api/server";
import { listComments } from "@/services/community/comments";
import { getPost } from "@/services/community/posts";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

const loadPost = cache(async (id: string) => {
  try {
    return await getPost(id, await serverApiOptions());
  } catch (cause) {
    if (cause instanceof ApiClientError && cause.status === 404) {
      return null;
    }
    throw cause;
  }
});

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params;
  const post = await loadPost(id);
  if (!post) return { title: "内容不存在 · 新岛 AI" };
  return {
    title: `${post.title} · 新岛社区`,
    description: post.excerpt ?? undefined,
  };
}

export default async function CommunityPostPage({ params }: PageProps) {
  const { id } = await params;
  const requestOptions = await serverApiOptions();

  // parallel fetch — listComments uses the URL id directly (equals post.id)
  const [post, commentsPage] = await Promise.all([
    loadPost(id),
    listComments(id, { page: 1, pageSize: 50 }, requestOptions),
  ]);

  if (!post) {
    notFound();
  }
  const categoryLabel = post.isFeatured ? "精华" : "最新";
  const categoryHref = post.isFeatured ? "/community" : "/community/latest";
  const column = post.column;

  return (
    <article className="mx-auto w-full max-w-3xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Breadcrumb
          items={[
            { label: "社区", href: "/community" },
            ...(column
              ? [
                  { label: "专栏", href: "/community/columns" },
                  {
                    label: column.title,
                    href: `/community/columns/${column.id}`,
                  },
                ]
              : [{ label: categoryLabel, href: categoryHref }]),
            { label: post.title },
          ]}
        />
        <DetailBackLink
          fallbackHref={column ? `/community/columns/${column.id}` : categoryHref}
          label="返回上一页"
        />
      </div>

      <header className="mt-5">
        <div className="flex flex-wrap items-center gap-2">
          {post.isFeatured ? (
            <Link href="/community">
              <Badge variant="accent">精华</Badge>
            </Link>
          ) : null}
          {post.tags.map((tag) => (
            <Link
              key={tag}
              href={withQuery(categoryHref, { tag, page: 1 })}
            >
              <Badge variant="accent">{tag}</Badge>
            </Link>
          ))}
        </div>

        <h1 className="mt-4 text-3xl leading-tight font-bold tracking-tight text-foreground">
          {post.title}
        </h1>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-b border-border pb-5">
          <Link
            href={`/u/${post.author.username}`}
            className="flex items-center gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Avatar
              src={post.author.avatarUrl}
              name={post.author.displayName}
              size={40}
            />
            <div className="leading-tight">
              <p className="text-[14px] font-medium text-foreground transition-colors hover:text-primary">
                {post.author.displayName}
              </p>
              <p className="text-[12px] text-muted-foreground">
                {post.publishedAt ? formatRelative(post.publishedAt) : "草稿"} ·{" "}
                {formatCount(post.viewCount)} 次浏览
              </p>
            </div>
          </Link>
          <div className="flex items-center gap-4 text-[13px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <HeartIcon className="size-4" />
              {formatCount(post.likeCount)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <ChatIcon className="size-4" />
              {formatCount(post.commentCount)}
            </span>
          </div>
        </div>
      </header>

      <div className="mt-8">
        <MarkdownContent
          content={post.content}
          skipLeadingImages
          skipImageUrls={
            post.coverImageUrl ? [post.coverImageUrl] : undefined
          }
        />
      </div>

      <PostAttachments attachments={post.attachments ?? []} />

      <PostReactionBar
        postId={post.id}
        initialLikeCount={post.likeCount}
        initialLiked={post.isLiked}
        initialBookmarked={post.isBookmarked}
      />

      <PostModerationBar
        postId={post.id}
        authorId={post.author.id}
        initialFeatured={post.isFeatured}
        initialStatus={post.status}
      />

      <CommentSection
        postId={post.id}
        initialComments={commentsPage.items}
      />
    </article>
  );
}
