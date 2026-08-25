"use client";

import { useState } from "react";

import { Icon } from "@/components/icons";
import { Busy, Button, Notice } from "@/components/ui";

// A real download rather than a link, so a failure says so instead of
// navigating to an error page and losing the settings screen underneath.
export function ExportButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/account/export");
      if (!response.ok) {
        setError("The export did not finish. Try again in a moment.");
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "markedfox-export.json";
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <Button type="button" size="sm" onClick={run} disabled={busy} className="w-fit">
        <Icon name="export" className="h-3.5 w-3.5" />
        <Busy busy={busy}>
          {busy ? "Preparing…" : "Export my data"}
        </Busy>
      </Button>
      {error ? <Notice tone="danger">{error}</Notice> : null}
    </div>
  );
}
