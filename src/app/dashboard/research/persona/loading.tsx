import { SkeletonForm, SkeletonHeader, SkeletonPage } from "@/components/skeleton";

export default function Loading() {
  return (
    <SkeletonPage label="Loading persona" width="max-w-[680px]">
      <SkeletonHeader />
      <SkeletonForm fields={4} />
    </SkeletonPage>
  );
}
