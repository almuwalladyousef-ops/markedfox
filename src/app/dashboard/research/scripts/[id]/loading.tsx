import { SkeletonForm, SkeletonHeader, SkeletonPage } from "@/components/skeleton";

export default function Loading() {
  return (
    <SkeletonPage label="Loading script" width="max-w-[780px]">
      <SkeletonHeader />
      <SkeletonForm fields={4} />
    </SkeletonPage>
  );
}
