import { Skeleton, SkeletonForm } from "@/components/skeleton";

// Inside the settings layout, so the menu stays put and only the pane waits.
export default function SettingsPaneLoading() {
  return (
    <div role="status" aria-live="polite" aria-label="Loading settings" className="flex w-full flex-col gap-5">
      <Skeleton className="h-7 w-48 rounded-lg" />
      <SkeletonForm fields={3} />
    </div>
  );
}
