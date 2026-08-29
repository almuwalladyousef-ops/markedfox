"use client";

import { useEffect } from "react";

import { useStaleBuildReload } from "@/components/stale-build";
import { Button, ButtonLink, FoxMark } from "@/components/ui";

// The boundary under the root layout: marketing, auth, and anything the
// dashboard's own boundary did not catch. Next 16 hands the recovery callback
// to error boundaries as `retry` (the `reset` name is gone).
//
// The most common thing to land here is not a bug: a tab open across a deploy
// holding chunk URLs that no longer exist. That case reloads itself once and
// never shows this screen; everything else does.
export default function ErrorPage({
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
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-bg px-4 py-12 text-center text-ink">
      <FoxMark className="h-9" />
      <div>
        <h1 className="font-display text-[30px]/[36px] font-bold tracking-[-0.025em]">
          Something broke on our side
        </h1>
        <p className="mx-auto mt-2 max-w-md text-[15px]/[24px] text-pretty text-muted">
          The page hit an error it could not recover from. Your work on the
          server is safe — trying again usually clears it.
        </p>
        {error.digest ? (
          <p className="mt-3 text-[12.5px] text-faint">
            Error reference: <span className="font-mono">{error.digest}</span>
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button tone="primary" onClick={() => retry()}>
          Try again
        </Button>
        <Button onClick={() => window.location.reload()}>Reload the page</Button>
        <ButtonLink href="/dashboard">Open the dashboard</ButtonLink>
      </div>
    </main>
  );
}
