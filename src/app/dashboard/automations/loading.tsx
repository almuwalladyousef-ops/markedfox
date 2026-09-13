import { SkeletonHeader, SkeletonList, SkeletonPage, SkeletonPills } from "@/components/skeleton";

export default function AutomationsLoading() {
  return (
    <SkeletonPage label="Loading automations">
      <SkeletonHeader actions={1} />
      <SkeletonPills count={3} />
      <SkeletonList rows={4} />
    </SkeletonPage>
  );
}
