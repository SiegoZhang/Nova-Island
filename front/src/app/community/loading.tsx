import {
  CardGridSkeleton,
  PageHeaderSkeleton,
} from "@/components/community/skeletons";

export default function CommunityLoading() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeaderSkeleton />
      <CardGridSkeleton count={6} />
    </div>
  );
}
