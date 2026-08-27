import { Skeleton } from "@/components/ui/skeleton";

export default function CommunityPostLoading() {
  return (
    <div className="mx-auto max-w-3xl">
      <Skeleton className="h-4 w-48" />
      <div className="mt-5 flex gap-2">
        <Skeleton className="h-5 w-16 rounded-full" />
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      <Skeleton className="mt-4 h-9 w-11/12" />
      <Skeleton className="mt-2 h-9 w-2/3" />

      <div className="mt-6 flex items-center gap-3 border-b border-border pb-5">
        <Skeleton className="size-10 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-32" />
        </div>
      </div>

      <div className="mt-8 space-y-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-5 w-full" />
        ))}
        <Skeleton className="h-5 w-4/5" />
      </div>
    </div>
  );
}
