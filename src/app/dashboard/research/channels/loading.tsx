import { SkeletonGrid, SkeletonHeader, SkeletonPage, SkeletonPills } from "@/components/skeleton";

export default function ChannelsLoading() {
  return (
    <SkeletonPage label="Loading channels" width="max-w-[1180px]">
      <SkeletonHeader />
      <SkeletonPills count={4} />
      <SkeletonGrid count={6} aspect="aspect-[16/9]" columns="grid-cols-1 sm:grid-cols-2 wide:grid-cols-3" caption />
    </SkeletonPage>
  );
}
