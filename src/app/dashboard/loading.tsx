import {
  Skeleton,
  SkeletonGrid,
  SkeletonPage,
  SkeletonPills,
  SkeletonProfile,
} from "@/components/skeleton";

// Home's outline while its reads run: the account strip, the profile and its
// three totals, the post-type filter, then the grid. This file is also the
// fallback for any dashboard route without a loading screen of its own, which
// is why it replaced the lone spinner — a spinner in 40vh of empty space was
// the one wait in the app that looked like nothing was happening.
export default function DashboardLoading() {
  return (
    <SkeletonPage label="Loading home">
      <div className="flex items-center gap-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-9 w-9 rounded-full" />
        ))}
      </div>
      <SkeletonProfile />
      <SkeletonPills count={4} centered />
      <SkeletonGrid count={8} aspect="aspect-square" />
    </SkeletonPage>
  );
}
