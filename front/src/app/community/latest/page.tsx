import Link from "next/link";

import { ComposePostButton } from "@/components/community/ComposePostButton";
import { PageHeader } from "@/components/community/PageHeader";
import { Pagination } from "@/components/community/Pagination";
import { PostCard } from "@/components/community/PostCard";
import { TagFilterBar } from "@/components/community/TagFilterBar";
import { InboxIcon } from "@/components/icons";
import { EmptyState } from "@/components/ui/empty-state";
import { withQuery } from "@/lib/format";
import { serverApiOptions } from "@/services/api/server";
import { listPosts, listPostTags } from "@/services/community/posts";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 10;

interface PageProps {
  searchParams: Promise<{ page?: string; tag?: string }>;
}

export default async function CommunityLatestPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const tag =
    params.tag && params.tag !== "全部" ? params.tag : undefined;
  const requestOptions = await serverApiOptions();

  const [data, tags] = await Promise.all([
    listPosts(
      {
        page,
        pageSize: PAGE_SIZE,
        tag,
      },
      requestOptions,
    ),
    listPostTags({}, requestOptions),
  ]);

  const filters = ["全部", ...tags.filter((name) => name !== "全部")];

  return (
    <div className="flex flex-1 flex-col gap-8">
      <PageHeader
        title="最新"
        description="岛民实时动态与讨论，按时间倒序，第一时间捕捉新鲜想法。"
        action={<ComposePostButton label="发个动态" />}
      />

      <TagFilterBar
        items={filters.map((filter) => ({
          label: filter,
          active: filter === "全部" ? !tag : tag === filter,
          href: withQuery("/community/latest", {
            tag: filter === "全部" ? undefined : filter,
            page: 1,
          }),
        }))}
      />

      {data.items.length === 0 ? (
        <EmptyState
          icon={<InboxIcon className="size-6" />}
          title={tag ? `「${tag}」暂无动态` : "还没有新动态"}
          description={
            tag
              ? "这个标签下还没有帖子。可以换「全部」看看，或发布一篇带该标签的内容。"
              : "成为第一个发声的人。登录后即可发布，内容会出现在本页列表。"
          }
          action={
            <div className="flex flex-wrap items-center justify-center gap-3">
              {tag ? (
                <Link
                  href="/community/latest"
                  className="inline-flex h-10 items-center justify-center rounded-full border border-border bg-card/60 px-5 text-[13px] font-medium text-foreground transition-colors hover:border-foreground/25 hover:bg-card"
                >
                  查看全部最新
                </Link>
              ) : null}
              <ComposePostButton
                label="发布第一条动态"
                guestLabel="登录并发布"
              />
            </div>
          }
        />
      ) : (
        <>
          <div className="flex flex-col gap-4">
            {data.items.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                variant="list"
                tagListBase="/community/latest"
              />
            ))}
          </div>
          <Pagination
            page={data.pagination.page}
            totalPages={data.pagination.totalPages}
            hrefForPage={(p) =>
              withQuery("/community/latest", { page: p, tag })
            }
            className="pt-2"
          />
        </>
      )}
    </div>
  );
}
