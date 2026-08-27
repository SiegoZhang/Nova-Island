import {
  ListSkeleton,
  PageHeaderSkeleton,
} from "@/components/community/skeletons";

export default function CommunityLatestLoading() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeaderSkeleton />
      <ListSkeleton count={5} />
    </div>
  );
}
