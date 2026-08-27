import Link from "next/link";

import { PageHeader } from "@/components/community/PageHeader";
import { InboxIcon } from "@/components/icons";
import { Avatar } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCount, withQuery } from "@/lib/format";
import { cn } from "@/lib/utils";
import { serverApiOptions } from "@/services/api/server";
import { listRankings } from "@/services/community/rankings";
import type { RankingEntry } from "@/types/community";

export const dynamic = "force-dynamic";

type RankingPeriod = "weekly" | "monthly" | "all";

const PERIODS: { id: RankingPeriod; label: string; emptyTitle: string }[] = [
  { id: "weekly", label: "本周", emptyTitle: "本周榜单暂未生成" },
  { id: "monthly", label: "本月", emptyTitle: "本月榜单暂未生成" },
  { id: "all", label: "总榜", emptyTitle: "总榜暂未生成" },
];

const trendMeta: Record<
  RankingEntry["trend"],
  { symbol: string; className: string }
> = {
  up: { symbol: "▲", className: "text-accent" },
  down: { symbol: "▼", className: "text-muted-foreground" },
  flat: { symbol: "—", className: "text-muted-foreground/60" },
};

function rankBadgeClass(rank: number): string {
  if (rank === 1) return "bg-primary text-primary-foreground";
  if (rank <= 3) return "bg-accent/25 text-foreground";
  return "bg-secondary text-muted-foreground";
}

function parsePeriod(value: string | undefined): RankingPeriod {
  if (value === "monthly" || value === "all" || value === "weekly") {
    return value;
  }
  return "weekly";
}

interface PageProps {
  searchParams: Promise<{ period?: string }>;
}

export default async function CommunityRankingPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const period = parsePeriod(params.period);
  const periodMeta = PERIODS.find((item) => item.id === period) ?? PERIODS[0];
  const rankings = await listRankings(
    { period },
    await serverApiOptions(),
  );

  return (
    <div className="flex flex-1 flex-col gap-8">
      <PageHeader
        title="榜单"
        description={
          <>
            <span className="md:hidden">
              按获赞 / 评论 / 粉丝计分；每日凌晨自动重算。可切换本周、本月与总榜。
            </span>
            <span className="hidden md:inline">
              本周/本月按周期内获赞、被评与新增粉丝（赞×1、评×2、粉×3）；总榜为累计赞评+当前粉丝。窗口暂无互动时暂以累计贡献展示。每天
              03:00 自动重算。
            </span>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        {PERIODS.map((item) => {
          const active = item.id === period;
          return (
            <Link
              key={item.id}
              href={withQuery("/community/ranking", {
                period: item.id === "weekly" ? undefined : item.id,
              })}
              className={cn(
                "inline-flex min-h-10 items-center justify-center rounded-full px-4 text-[13px] font-medium transition-[background-color,border-color,color] duration-300",
                active
                  ? "bg-primary text-primary-foreground"
                  : "border border-border bg-card/60 text-foreground hover:border-foreground/25 hover:bg-card",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </div>

      {rankings.length === 0 ? (
        <EmptyState
          className="min-h-[min(420px,50vh)] flex-1"
          icon={<InboxIcon className="size-6" />}
          title={periodMeta.emptyTitle}
          description="多发帖、多互动，下一次重算或许就能看到你的名字。"
        />
      ) : (
        <Card className="divide-y divide-border overflow-hidden p-0">
          {rankings.map((entry) => {
            const trend = trendMeta[entry.trend] ?? trendMeta.flat;
            return (
              <Link
                key={`${period}-${entry.rank}-${entry.user.id}`}
                href={`/u/${entry.user.username}`}
                className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-secondary/50 focus-visible:bg-secondary/50 focus-visible:outline-none"
              >
                <span
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold tabular-nums",
                    rankBadgeClass(entry.rank),
                  )}
                >
                  {entry.rank}
                </span>

                <Avatar
                  src={entry.user.avatarUrl}
                  name={entry.user.displayName}
                  size={40}
                />

                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-semibold text-foreground">
                    {entry.user.displayName}
                  </p>
                  <p className="truncate text-[12px] text-muted-foreground">
                    {entry.headline}
                  </p>
                </div>

                <div className="shrink-0 text-right">
                  <p className="text-[15px] font-semibold tabular-nums text-foreground">
                    {formatCount(entry.score)}
                  </p>
                  <p className={cn("text-[12px]", trend.className)}>
                    {trend.symbol} 贡献值
                  </p>
                </div>
              </Link>
            );
          })}
        </Card>
      )}
    </div>
  );
}
