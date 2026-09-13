import { Skeleton, SkeletonHeader, SkeletonList, SkeletonPage } from "@/components/skeleton";

// The idea inbox beside the idea it has open.
export default function IdeasLoading() {
  return (
    <SkeletonPage label="Loading ideas" width="max-w-[1180px]">
      <SkeletonHeader />
      <div className="flex flex-wrap items-start gap-6">
        <div className="min-w-[280px] flex-[1_1_340px]">
          <SkeletonList rows={6} avatar={false} />
        </div>
        <Skeleton className="h-[420px] min-w-[300px] flex-[2_1_520px] rounded-2xl" />
      </div>
    </SkeletonPage>
  );
}
