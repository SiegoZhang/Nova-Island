import { InboxIcon } from "@/components/icons";
import { EmptyState } from "@/components/ui/empty-state";
import type { ReactNode } from "react";

export function AdminComingSoon({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <EmptyState
      icon={<InboxIcon className="size-6" />}
      title={title}
      description={description}
      action={action}
    />
  );
}
