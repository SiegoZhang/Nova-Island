import Image from "next/image";

import { PageHeader } from "@/components/community/PageHeader";
import {
  CalendarIcon,
  ClockIcon,
  GlobeIcon,
  InboxIcon,
} from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/format";
import { listEvents } from "@/services/community/events";
import type { CommunityEvent } from "@/types/community";

export const dynamic = "force-dynamic";

function EventCard({ event }: { event: CommunityEvent }) {
  const isFull = event.seatsLeft <= 0;
  const joinLabel = isFull ? "已报满" : "报名暂未开放";
  const joinTitle = isFull
    ? "名额已满"
    : "活动报名功能即将上线，敬请期待";

  return (
    <Card className="flex h-full flex-col p-6">
      <div className="flex items-center justify-between gap-3">
        <Badge variant={event.type === "线下" ? "default" : "accent"}>
          {event.type}
        </Badge>
        <span className="text-[12px] font-medium text-muted-foreground">
          {isFull ? "名额已满" : `剩余 ${event.seatsLeft} 席`}
        </span>
      </div>

      <h3 className="mt-4 text-[17px] leading-6 font-semibold tracking-[-0.02em] text-foreground">
        {event.title}
      </h3>
      <p className="mt-2 text-[13px] leading-6 text-muted-foreground">
        {event.description}
      </p>

      <dl className="mt-5 space-y-2 text-[12px] text-muted-foreground">
        <div className="flex items-center gap-2">
          <CalendarIcon className="size-3.5" />
          <dd>{formatDate(event.date)}</dd>
        </div>
        <div className="flex items-center gap-2">
          <ClockIcon className="size-3.5" />
          <dd>{event.time}</dd>
        </div>
        <div className="flex items-center gap-2">
          <GlobeIcon className="size-3.5" />
          <dd>{event.city}</dd>
        </div>
      </dl>

      <div className="mt-auto flex items-center justify-between gap-3 pt-6">
        <div className="flex items-center gap-2">
          {event.host.avatarUrl ? (
            <Image
              src={event.host.avatarUrl}
              alt={`${event.host.displayName} 头像`}
              width={24}
              height={24}
              className="size-6 rounded-full object-cover"
            />
          ) : null}
          <span className="text-[12px] text-muted-foreground">
            主理人 {event.host.displayName}
          </span>
        </div>
        <Button size="sm" disabled title={joinTitle} aria-disabled="true">
          {joinLabel}
        </Button>
      </div>
    </Card>
  );
}

export default async function CommunityEventsPage() {
  const events = await listEvents();

  return (
    <div className="flex flex-1 flex-col gap-8">
      <PageHeader
        title="活动"
        description="线上分享与同城线下见面会，把线上的连接带到现实里。报名通道尚未开通，可先浏览场次信息。"
      />

      {events.length === 0 ? (
        <EmptyState
          className="min-h-[min(420px,50vh)] flex-1"
          icon={<InboxIcon className="size-6" />}
          title="近期暂无活动"
          description="新的线上分享与线下见面会筹备中，欢迎稍后再来。"
        />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      )}
    </div>
  );
}
