import { Skeleton, SkeletonForm, SkeletonHeader, SkeletonPage } from "@/components/skeleton";

// The rule builder beside its phone preview.
export default function BuilderLoading() {
  return (
    <SkeletonPage label="Loading automation" width="max-w-[1060px]">
      <SkeletonHeader />
      <div className="flex flex-wrap items-start gap-6">
        <div className="min-w-[300px] flex-[1_1_520px]">
          <SkeletonForm fields={4} />
        </div>
        <Skeleton className="aspect-[9/16] w-full max-w-[300px] rounded-2xl" />
      </div>
    </SkeletonPage>
  );
}
