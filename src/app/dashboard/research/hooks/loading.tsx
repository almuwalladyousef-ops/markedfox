import { SkeletonHeader, SkeletonList, SkeletonPage } from "@/components/skeleton";

export default function Loading() {
  return (
    <SkeletonPage label="Loading hooks" width="max-w-[1080px]">
      <SkeletonHeader actions={1} />
      <SkeletonList rows={5} avatar={false} />
    </SkeletonPage>
  );
}
