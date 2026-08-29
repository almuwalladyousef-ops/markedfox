"use client";

import { useEffect } from "react";

import "./globals.css";

// The last resort: this replaces the root layout itself when it is the thing
// that threw, so it must carry its own <html> and <body>. No theme cookie is
// readable here and the font variables are gone with the layout, so it leans
// on the token defaults (light) and the system stack — a plain page that
// works beats a styled one that depends on the code that just failed.
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="bg-bg text-ink antialiased">
        <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 py-12 text-center">
          <div>
            <h1 className="text-[30px]/[36px] font-bold tracking-[-0.025em]">
              MarkedFox hit an error
            </h1>
            <p className="mx-auto mt-2 max-w-md text-[15px]/[24px] text-muted">
              The app could not draw this page. Trying again usually clears it.
            </p>
            {error.digest ? (
              <p className="mt-3 text-[12.5px] text-faint">
                Error reference: <span className="font-mono">{error.digest}</span>
              </p>
            ) : null}
          </div>
          <button
            onClick={() => retry()}
            className="inline-flex items-center justify-center rounded-lg bg-accent px-4 py-2.5 text-[14.5px] font-semibold text-accent-ink"
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
