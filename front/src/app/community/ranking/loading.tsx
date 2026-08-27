import { PageHeaderSkeleton } from "@/components/community/skeletons";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function CommunityRankingLoading() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeaderSkeleton />
      <Card className="divide-y divide-border p-0">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-4">
            <Skeleton className="size-8 rounded-full" />
            <Skeleton className="size-10 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-48 max-w-full" />
            </div>
            <Skeleton className="h-8 w-14" />
          </div>
        ))}
      </Card>
    </div>
  );
}
