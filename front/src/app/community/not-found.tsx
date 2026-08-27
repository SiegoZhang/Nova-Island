import Link from "next/link";

import { InboxIcon } from "@/components/icons";
import { EmptyState } from "@/components/ui/empty-state";

export default function CommunityNotFound() {
  return (
    <div className="py-10">
      <EmptyState
        icon={<InboxIcon className="size-6" />}
        title="没有找到这块内容"
        description="它可能已被移动或删除。回到社区首页，看看其他精华内容吧。"
        action={
          <Link
            href="/community"
            className="inline-flex h-10 items-center justify-center rounded-full bg-primary px-5 text-[13px] font-medium text-primary-foreground transition-[background-color,transform] duration-300 hover:-translate-y-px hover:bg-foreground/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
          >
            返回社区首页
          </Link>
        }
      />
    </div>
  );
}
