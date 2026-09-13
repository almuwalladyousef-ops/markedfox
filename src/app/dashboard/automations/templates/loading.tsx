import { SkeletonGrid, SkeletonHeader, SkeletonPage } from "@/components/skeleton";

export default function TemplatesLoading() {
  return (
    <SkeletonPage label="Loading templates">
      <SkeletonHeader />
      <SkeletonGrid count={6} aspect="aspect-[4/3]" columns="grid-cols-1 sm:grid-cols-2 wide:grid-cols-3" caption />
    </SkeletonPage>
  );
}
