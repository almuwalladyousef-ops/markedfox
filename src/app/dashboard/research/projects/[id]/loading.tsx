import { SkeletonForm, SkeletonHeader, SkeletonPage } from "@/components/skeleton";

export default function Loading() {
  return (
    <SkeletonPage label="Loading project" width="max-w-[720px]">
      <SkeletonHeader />
      <SkeletonForm fields={3} />
    </SkeletonPage>
  );
}
