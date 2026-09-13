import { SkeletonHeader, SkeletonList, SkeletonPage } from "@/components/skeleton";

export default function Loading() {
  return (
    <SkeletonPage label="Loading projects" width="max-w-[980px]">
      <SkeletonHeader actions={1} />
      <SkeletonList rows={5} avatar={false} />
    </SkeletonPage>
  );
}
