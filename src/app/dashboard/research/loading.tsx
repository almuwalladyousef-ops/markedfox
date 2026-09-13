import { Skeleton, SkeletonGrid, SkeletonHeader, SkeletonPage } from "@/components/skeleton";

// The research feed: its toolbar, then video cards with their captions.
export default function ResearchLoading() {
  return (
    <SkeletonPage label="Loading videos" width="max-w-[1240px]">
      <SkeletonHeader actions={1} />
      <Skeleton className="h-12 w-full rounded-lg" />
      <SkeletonGrid count={8} caption />
    </SkeletonPage>
  );
}
