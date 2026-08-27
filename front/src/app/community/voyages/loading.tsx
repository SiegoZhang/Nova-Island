import {
  CardGridSkeleton,
  PageHeaderSkeleton,
} from "@/components/community/skeletons";

export default function CommunityVoyagesLoading() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeaderSkeleton />
      <CardGridSkeleton count={4} />
    </div>
  );
}
