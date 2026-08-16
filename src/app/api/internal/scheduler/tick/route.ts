import { timingSafeEqual } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { runSchedulerTick } from "@/lib/publish/scheduler";
import { createServiceRoleClient } from "@/lib/supabase/service";

// POST /api/internal/scheduler/tick — one scheduler pass.
//
// Hit by scripts/run-scheduler.mjs from the systemd timer, over loopback, with
// `Authorization: Bearer $SCHEDULER_SECRET`. The Caddyfile also refuses
// /api/internal/* from the public side, so this check is the second lock, not
// the only one. No secret configured = nothing runs (fail closed).
//
// Runs with the service-role client because there is no user session; every
// query in the tick filters explicitly by the post's owner.

function authorized(request: NextRequest): boolean {
  const secret = process.env.SCHEDULER_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  const presented = header.startsWith("Bearer ") ? header.slice(7) : "";
  const a = Buffer.from(presented);
  const b = Buffer.from(secret);
  // timingSafeEqual needs equal lengths; a length mismatch is a mismatch.
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  if (!process.env.SCHEDULER_SECRET) {
    return NextResponse.json({ error: "scheduler_not_configured" }, { status: 503 });
  }
  if (!authorized(request)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const started = Date.now();
  try {
    const summary = await runSchedulerTick(createServiceRoleClient());
    const { reports, ...counts } = summary;
    // Per-post detail goes to the server log, the counts to the caller.
    for (const report of reports) {
      const failed = report.targets.filter((t) => t.outcome === "failed");
      console.log(
        `scheduler: post ${report.postId} ${report.status}` +
          (failed.length
            ? ` — ${failed.map((t) => `${t.platform ?? "?"}: ${t.outcome === "failed" ? t.error : ""}`).join("; ")}`
            : ""),
      );
    }
    return NextResponse.json({ ...counts, ms: Date.now() - started });
  } catch (error) {
    console.error("scheduler: tick failed", error);
    return NextResponse.json(
      { error: "tick_failed", detail: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
