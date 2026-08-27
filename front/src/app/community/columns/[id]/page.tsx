import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Breadcrumb } from "@/components/community/Breadcrumb";
import { PageHeader } from "@/components/community/PageHeader";
import { PostCard } from "@/components/community/PostCard";
import { InboxIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ApiClientError } from "@/services/api/errors";
import { serverApiOptions } from "@/services/api/server";
import { getColumn, listColumnPosts } from "@/services/community/columns";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params;
  try {
    const column = await getColumn(id, await serverApiOptions());
    return {
      title: `${column.title} · 专栏 · 新岛社区`,
      description: column.description,
    };
  } catch {
    return { title: "专栏不存在 · 新岛 AI" };
  }
}

export default async function CommunityColumnDetailPage({ params }: PageProps) {
  const { id } = await params;
  const options = await serverApiOptions();

  let column;
  try {
    column = await getColumn(id, options);
  } catch (cause) {
    if (cause instanceof ApiClientError && cause.status === 404) {
      notFound();
    }
    throw cause;
  }

  const postsPage = await listColumnPosts(
    id,
    { page: 1, pageSize: 50 },
    options,
  );

  return (
    <div className="flex flex-1 flex-col gap-8">
      <Breadcrumb
        items={[
          { label: "社区", href: "/community" },
          { label: "专栏", href: "/community/columns" },
          { label: column.title },
        ]}
      />

      <PageHeader
        title={column.title}
        description={column.description}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="accent">{column.tag}</Badge>
            <span className="text-[13px] text-muted-foreground">
              {column.author.displayName} · {column.cadence} ·{" "}
              {column.articleCount} 篇
            </span>
          </div>
        }
      />

      {postsPage.items.length === 0 ? (
        <EmptyState
          icon={<InboxIcon className="size-6" />}
          title="专栏暂无文章"
          description="内容整理中，稍后再来。"
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {postsPage.items.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      )}
    </div>
  );
}
