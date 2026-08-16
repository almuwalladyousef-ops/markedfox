// One scheduler tick. Invoked by markedfox-scheduler.timer every minute.
//
// This script is deliberately thin. The publish adapters are TypeScript inside
// the Next.js app, and this is plain Node with no build step, so rather than
// duplicate the logic here it asks the running app to do a tick:
//
//   POST http://127.0.0.1:3000/api/internal/scheduler/tick
//   Authorization: Bearer $SCHEDULER_SECRET
//
// The app claims due posts (status scheduled → publishing), publishes each to
// its targets, writes history and usage rows, and settles the status. What
// this script proves every minute is the plumbing: the timer fires, the unit
// runs as the service account, the app is up, and the secret matches.
//
// Concurrency: systemd will not start a second instance of a oneshot unit
// while the first is still running, and this script waits for the app's
// response, so with a single droplet two ticks cannot overlap. That guarantee
// ends the moment a second box exists — Phase 6 replaces the poll with
// SELECT … FOR UPDATE SKIP LOCKED.

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`FATAL: ${name} is not set. Check /srv/markedfox/.env.production`);
    process.exit(1);
  }
  return value;
}

const secret = requireEnv("SCHEDULER_SECRET");
const base = (process.env.SCHEDULER_TARGET || "http://127.0.0.1:3000").replace(/\/+$/, "");

// Below the unit's TimeoutStartSec=300, so a hung tick is reported by this
// script rather than killed by systemd with no log line of its own.
const TIMEOUT_MS = 280_000;

let response;
try {
  response = await fetch(`${base}/api/internal/scheduler/tick`, {
    method: "POST",
    headers: { authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
} catch (err) {
  console.error(`scheduler: could not reach the app at ${base} — ${err?.message ?? err}`);
  process.exit(1);
}

const text = await response.text();
if (!response.ok) {
  console.error(`scheduler: tick returned HTTP ${response.status} — ${text.slice(0, 500)}`);
  process.exit(1);
}

let summary;
try {
  summary = JSON.parse(text);
} catch {
  console.error(`scheduler: tick returned non-JSON — ${text.slice(0, 200)}`);
  process.exit(1);
}

// Quiet on the common path: a line a minute, every minute, would bury the
// journal entries that matter.
if (summary.due > 0) {
  console.log(
    `scheduler: due=${summary.due} claimed=${summary.claimed} published=${summary.published} ` +
      `partial=${summary.partial} failed=${summary.failed} in ${summary.ms}ms`,
  );
}
