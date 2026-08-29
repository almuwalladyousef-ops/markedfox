"use client";

import { useEffect } from "react";

import { useStaleBuildReload } from "@/components/stale-build";
import { Button, Page } from "@/components/ui";

// The dashboard's own boundary, so a page that throws leaves the sidebar and
// tabs standing and the person one click from anywhere else in the app.
// A tab left open across a deploy reloads itself once instead of landing here.
export default function DashboardError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useStaleBuildReload(error);
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Page>
      <div className="rounded-2xl border border-dashed border-line px-6 py-12 text-center">
        <p className="font-display text-[16px] font-bold text-ink">
          This screen hit an error
        </p>
        <p className="mx-auto mt-2 max-w-md text-[14px]/[21px] text-pretty text-muted">
          Nothing you saved was lost. Try the screen again, and if it keeps
          failing, the rest of the app still works from the sidebar.
        </p>
        {error.digest ? (
          <p className="mt-3 text-[12.5px] text-faint">
            Error reference: <span className="font-mono">{error.digest}</span>
          </p>
        ) : null}
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <Button tone="primary" onClick={() => retry()}>
            Try again
          </Button>
          <Button onClick={() => window.location.reload()}>Reload the page</Button>
        </div>
      </div>
    </Page>
  );
}
