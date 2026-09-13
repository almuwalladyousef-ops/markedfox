import { Skeleton, SkeletonPage, SkeletonPills } from "@/components/skeleton";

// One video's analysis: the video beside its tabs and their text.
export default function AnalysisLoading() {
  return (
    <SkeletonPage label="Loading analysis" width="max-w-[1160px]">
      <Skeleton className="h-8 w-2/3 rounded-lg" />
      <div className="flex flex-wrap items-start gap-6">
        <Skeleton className="aspect-[9/16] w-full max-w-[320px] rounded-2xl" />
        <div className="flex min-w-[300px] flex-[1_1_520px] flex-col gap-4">
          <SkeletonPills count={5} />
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-4" style={{ width: `${92 - ((i * 17) % 35)}%` }} />
          ))}
        </div>
      </div>
    </SkeletonPage>
  );
}
