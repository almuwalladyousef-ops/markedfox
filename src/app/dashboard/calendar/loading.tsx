import { Skeleton, SkeletonPage, SkeletonPills } from "@/components/skeleton";

// The calendar's outline: heading and controls, the platform filter, then a
// month of cells — the view it opens on.
export default function CalendarLoading() {
  return (
    <SkeletonPage label="Loading calendar" width="max-w-none">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Skeleton className="h-8 w-52 rounded-lg" />
        <div className="flex gap-2">
          <Skeleton className="h-10 w-24 rounded-lg" />
          <Skeleton className="h-10 w-44 rounded-lg" />
        </div>
      </div>
      <SkeletonPills count={6} centered />
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-2xl border border-line bg-line">
        {Array.from({ length: 35 }, (_, i) => (
          <div key={i} className="flex min-h-[92px] flex-col gap-2 bg-panel p-2 shell:min-h-[112px]">
            <Skeleton className="h-3.5 w-5" />
            {i % 5 === 2 ? <Skeleton className="h-10 w-full rounded-md" /> : null}
          </div>
        ))}
      </div>
    </SkeletonPage>
  );
}
