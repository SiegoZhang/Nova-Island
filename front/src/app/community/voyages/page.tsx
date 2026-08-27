import Image from "next/image";

import { PageHeader } from "@/components/community/PageHeader";
import { CompassIcon, InboxIcon, UsersIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import type { BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { listVoyages } from "@/services/community/voyages";
import type { Voyage } from "@/types/community";

export const dynamic = "force-dynamic";

const statusMeta: Record<
  Voyage["status"],
  { label: string; variant: BadgeProps["variant"] }
> = {
  recruiting: { label: "招募中", variant: "accent" },
  in_progress: { label: "进行中", variant: "default" },
  finished: { label: "已结束", variant: "outline" },
};

function VoyageCard({ voyage }: { voyage: Voyage }) {
  const meta = statusMeta[voyage.status];
  const isFull = voyage.memberCount >= voyage.capacity;
  const isFinished = voyage.status === "finished";
  const progress = Math.min(
    100,
    Math.round((voyage.memberCount / voyage.capacity) * 100),
  );

  // 报名 API 尚未接通：一律禁用，文案诚实说明原因
  const joinLabel = isFinished
    ? "已结束"
    : isFull
      ? "已满员"
      : "报名暂未开放";
  const joinTitle = isFinished
    ? "本期限航已结束"
    : isFull
      ? "名额已满"
      : "报名功能即将上线，敬请期待";

  return (
    <Card className="flex h-full flex-col p-6">
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground">
          <CompassIcon className="size-4 text-accent" />
          {voyage.category}
        </span>
        <Badge variant={meta.variant}>{meta.label}</Badge>
      </div>

      <h3 className="mt-4 text-[17px] leading-6 font-semibold tracking-[-0.02em] text-foreground">
        {voyage.title}
      </h3>
      <p className="mt-2 text-[13px] leading-6 text-muted-foreground">
        {voyage.summary}
      </p>

      <div className="mt-5">
        <div className="flex items-center justify-between text-[12px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <UsersIcon className="size-3.5" />
            {voyage.memberCount}/{voyage.capacity} 人
          </span>
          <span>{voyage.durationWeeks} 周</span>
        </div>
        <div
          className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-secondary"
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="mt-auto flex items-center justify-between gap-3 pt-6">
        <div className="flex items-center gap-2">
          {voyage.captain.avatarUrl ? (
            <Image
              src={voyage.captain.avatarUrl}
              alt={`${voyage.captain.displayName} 头像`}
              width={28}
              height={28}
              className="size-7 rounded-full object-cover"
            />
          ) : null}
          <div className="leading-tight">
            <p className="text-[12px] font-medium text-foreground">
              {voyage.captain.displayName}
            </p>
            <p className="text-[11px] text-muted-foreground">船长</p>
          </div>
        </div>
        <Button size="sm" disabled title={joinTitle} aria-disabled="true">
          {joinLabel}
        </Button>
      </div>
    </Card>
  );
}

export default async function CommunityVoyagesPage() {
  const voyages = await listVoyages();

  return (
    <div className="flex flex-1 flex-col gap-8">
      <PageHeader
        title="航海"
        description="限时实战项目组，和一群同行者定目标、共反馈、齐上船。报名通道尚未开通，可先浏览计划。"
      />

      {voyages.length === 0 ? (
        <EmptyState
          icon={<InboxIcon className="size-6" />}
          title="暂无航海计划"
          className="min-h-[min(420px,50vh)] flex-1"
          description="新的实战组队即将开放，先去精华区看看岛民的经验吧。"
        />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-2">
          {voyages.map((voyage) => (
            <VoyageCard key={voyage.id} voyage={voyage} />
          ))}
        </div>
      )}
    </div>
  );
}
