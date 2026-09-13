import { SkeletonForm, SkeletonHeader, SkeletonPage } from "@/components/skeleton";

export default function Loading() {
  return (
    <SkeletonPage label="Loading tools" width="max-w-[900px]">
      <SkeletonHeader />
      <SkeletonForm fields={2} />
    </SkeletonPage>
  );
}
