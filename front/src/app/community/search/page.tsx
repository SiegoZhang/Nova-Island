import Link from "next/link";

import { PageHeader } from "@/components/community/PageHeader";
import { Pagination } from "@/components/community/Pagination";
import { PostCard } from "@/components/community/PostCard";
import { InboxIcon, SearchIcon } from "@/components/icons";
import { EmptyState } from "@/components/ui/empty-state";
import { withQuery } from "@/lib/format";
import { serverApiOptions } from "@/services/api/server";
import { searchPosts } from "@/services/community/posts";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 10;

interface PageProps {
  searchParams: Promise<{ q?: string; page?: string }>;
}

export default async function CommunitySearchPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const page = Math.max(1, Number(params.page) || 1);
  const requestOptions = await serverApiOptions();

  const data = q
    ? await searchPosts({ q, page, pageSize: PAGE_SIZE }, requestOptions)
    : {
        items: [],
        pagination: { page: 1, pageSize: PAGE_SIZE, total: 0, totalPages: 0 },
      };

  return (
    <div className="flex flex-1 flex-col gap-8">
      <PageHeader
        title="搜索"
        description={
          q
            ? `关键词「${q}」· 共 ${data.pagination.total} 条结果`
            : "在顶部搜索框输入标题、正文或标签关键词。"
        }
      />

      {!q ? (
        <EmptyState
          icon={<SearchIcon className="size-6" />}
          title="输入关键词开始搜索"
          description="支持匹配帖子标题、正文、摘要与标签。"
        />
      ) : data.items.length === 0 ? (
        <EmptyState
          icon={<InboxIcon className="size-6" />}
          title={`没有找到「${q}」相关内容`}
          description="换个关键词试试，或去最新动态随便逛逛。"
          action={
            <Link
              href="/community/latest"
              className="inline-flex h-10 items-center justify-center rounded-full bg-primary px-5 text-[13px] font-medium text-primary-foreground transition-[background-color,transform] duration-300 hover:-translate-y-px hover:bg-foreground/90"
            >
              前往最新动态
            </Link>
          }
        />
      ) : (
        <>
          <div className="flex flex-col gap-4">
            {data.items.map((post) => (
              <PostCard key={post.id} post={post} variant="list" />
            ))}
          </div>
          <Pagination
            page={data.pagination.page}
            totalPages={data.pagination.totalPages}
            hrefForPage={(p) => withQuery("/community/search", { page: p, q })}
            className="pt-2"
          />
        </>
      )}
    </div>
  );
}
