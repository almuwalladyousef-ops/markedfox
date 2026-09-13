import { Skeleton, SkeletonPage, SkeletonPills } from "@/components/skeleton";

// The composer opens on its first step: the title and the row of post kinds.
export default function NewPostLoading() {
  return (
    <SkeletonPage label="Loading new post" width="max-w-[1120px]">
      <div className="flex items-center gap-3">
        <Skeleton className="h-8 w-8 rounded-full" />
        <Skeleton className="h-8 w-40 rounded-lg" />
      </div>
      <div className="flex min-h-[50vh] items-center justify-center">
        <SkeletonPills count={5} centered />
      </div>
    </SkeletonPage>
  );
}
