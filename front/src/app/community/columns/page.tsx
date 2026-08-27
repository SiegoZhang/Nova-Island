import Link from "next/link";

import { PageHeader } from "@/components/community/PageHeader";
import { BookIcon, InboxIcon } from "@/components/icons";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { InteractiveCard } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { listColumns } from "@/services/community/columns";
import type { Column } from "@/types/community";

export const dynamic = "force-dynamic";

function ColumnCard({ column }: { column: Column }) {
  return (
    <InteractiveCard className="flex h-full flex-col p-6">
      <Link
        href={`/community/columns/${column.id}`}
        className="rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="flex items-center justify-between gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-secondary text-foreground">
            <BookIcon className="size-5" />
          </span>
          <Badge variant="accent">{column.tag}</Badge>
        </div>

        <h3 className="mt-4 text-[17px] leading-6 font-semibold tracking-[-0.02em] text-foreground">
          {column.title}
        </h3>
        <p className="mt-2 text-[13px] leading-6 text-muted-foreground">
          {column.description}
        </p>

        <div className="mt-auto flex items-center justify-between gap-3 pt-6">
          <div className="flex items-center gap-2">
            <Avatar
              src={column.author.avatarUrl}
              name={column.author.displayName}
              size={24}
            />
            <span className="text-[12px] text-muted-foreground">
              {column.author.displayName} · {column.cadence} ·{" "}
              {column.articleCount} 篇
            </span>
          </div>
        </div>
      </Link>
    </InteractiveCard>
  );
}

export default async function CommunityColumnsPage() {
  const columns = await listColumns();

  return (
    <div className="flex flex-1 flex-col gap-8">
      <PageHeader
        title="专栏"
        description="垂直主题的系统化连载。点击进入专栏阅读文章；订阅功能尚未开通。"
      />

      {columns.length === 0 ? (
        <EmptyState
          className="min-h-[min(420px,50vh)] flex-1"
          icon={<InboxIcon className="size-6" />}
          title="暂无专栏"
          description="创作者正在准备连载内容，稍后再来看看。"
        />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2">
          {columns.map((column) => (
            <ColumnCard key={column.id} column={column} />
          ))}
        </div>
      )}
    </div>
  );
}
