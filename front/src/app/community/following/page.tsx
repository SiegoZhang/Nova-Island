import Link from "next/link";

import { ComposePostButton } from "@/components/community/ComposePostButton";
import { PageHeader } from "@/components/community/PageHeader";
import { Pagination } from "@/components/community/Pagination";
import { PostCard } from "@/components/community/PostCard";
import { InboxIcon } from "@/components/icons";
import { EmptyState } from "@/components/ui/empty-state";
import { withQuery } from "@/lib/format";
import { serverApiOptions } from "@/services/api/server";
import { listFollowingPosts } from "@/services/community/users";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 10;

interface PageProps {
  searchParams: Promise<{ page?: string }>;
}

export default async function CommunityFollowingPage({
  searchParams,
}: PageProps) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const requestOptions = await serverApiOptions();
  const data = await listFollowingPosts(
    { page, pageSize: PAGE_SIZE },
    requestOptions,
  );

  return (
    <div className="flex flex-1 flex-col gap-8">
      <PageHeader
        title="关注"
        description="你关注的岛民刚刚发布的内容，按时间倒序。"
        action={<ComposePostButton label="发布内容" />}
      />

      {data.items.length === 0 ? (
        <EmptyState
          icon={<InboxIcon className="size-6" />}
          title="关注动态还是空的"
          description="去主页关注几位岛民，他们的新帖会出现在这里。"
          action={
            <Link
              href="/community/latest"
              className="inline-flex h-10 items-center justify-center rounded-full bg-primary px-5 text-[13px] font-medium text-primary-foreground transition-[background-color,transform] duration-300 hover:-translate-y-px hover:bg-foreground/90"
            >
              去最新逛逛
            </Link>
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
            hrefForPage={(p) => withQuery("/community/following", { page: p })}
            className="pt-2"
          />
        </>
      )}
    </div>
  );
}
