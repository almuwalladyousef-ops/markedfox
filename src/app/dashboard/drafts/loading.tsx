import { SkeletonHeader, SkeletonList, SkeletonPage } from "@/components/skeleton";

export default function DraftsLoading() {
  return (
    <SkeletonPage label="Loading drafts">
      <SkeletonHeader />
      <SkeletonList rows={5} />
    </SkeletonPage>
  );
}
