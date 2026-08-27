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

const PAGE_SIZE = 9;

interface PageProps {
  searchParams: Promise<{ page?: string; tag?: string }>;
}

export default async function CommunityFeaturedPage({ searchParams }: PageProps) {
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
        featured: true,
        tag,
      },
      requestOptions,
    ),
    listPostTags({ featured: true }, requestOptions),
  ]);

  // 仅展示精华帖真实出现过的标签；「全部」始终在首
  const filters = ["全部", ...tags.filter((name) => name !== "全部")];

  return (
    <div className="flex flex-1 flex-col gap-8">
      <PageHeader
        title="精华"
        description="领航员精选的高价值实战复盘，每一篇都值得慢慢读完。"
        action={<ComposePostButton label="发布内容" />}
      />

      <TagFilterBar
        items={filters.map((filter) => ({
          label: filter,
          active: filter === "全部" ? !tag : tag === filter,
          href: withQuery("/community", {
            tag: filter === "全部" ? undefined : filter,
            page: 1,
          }),
        }))}
      />

      {data.items.length === 0 ? (
        <EmptyState
          icon={<InboxIcon className="size-6" />}
          title={tag ? `「${tag}」暂无精华` : "暂时还没有精华内容"}
          description={
            tag
              ? "这个标签下还没有被加精的帖子。可以换「全部」看看，或去最新浏览岛民动态。"
              : "精华由领航员从最新内容中挑选。你可以先去最新发帖或浏览，加精后会出现在这里。"
          }
          action={
            <div className="flex flex-wrap items-center justify-center gap-3">
              {tag ? (
                <Link
                  href="/community"
                  className="inline-flex h-10 items-center justify-center rounded-full border border-border bg-card/60 px-5 text-[13px] font-medium text-foreground transition-colors hover:border-foreground/25 hover:bg-card"
                >
                  查看全部精华
                </Link>
              ) : null}
              <Link
                href="/community/latest"
                className="inline-flex h-10 items-center justify-center rounded-full bg-primary px-5 text-[13px] font-medium text-primary-foreground transition-[background-color,transform] duration-300 hover:-translate-y-px hover:bg-foreground/90"
              >
                前往最新动态
              </Link>
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
                tagListBase="/community"
              />
            ))}
          </div>
          <Pagination
            page={data.pagination.page}
            totalPages={data.pagination.totalPages}
            hrefForPage={(p) =>
              withQuery("/community", { page: p, tag })
            }
            className="pt-2"
          />
        </>
      )}
    </div>
  );
}
