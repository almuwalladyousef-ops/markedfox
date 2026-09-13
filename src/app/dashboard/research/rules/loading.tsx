import { SkeletonHeader, SkeletonList, SkeletonPage } from "@/components/skeleton";

export default function Loading() {
  return (
    <SkeletonPage label="Loading auto-analyze rules" width="max-w-[900px]">
      <SkeletonHeader actions={1} />
      <SkeletonList rows={5} avatar={false} />
    </SkeletonPage>
  );
}
