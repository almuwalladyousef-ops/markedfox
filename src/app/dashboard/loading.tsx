import { Spinner } from "@/components/ui";

// Shown inside the shell while a dashboard page's server fetch runs. Before
// this file existed a navigation gave no feedback at all until the new page
// arrived — the one wait in the app with nothing on screen answering it.
export default function DashboardLoading() {
  return (
    <div
      className="flex min-h-[40vh] items-center justify-center"
      role="status"
      aria-label="Loading"
    >
      <Spinner className="h-5 w-5 text-faint" />
    </div>
  );
}
