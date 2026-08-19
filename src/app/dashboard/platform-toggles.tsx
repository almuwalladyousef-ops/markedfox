"use client";

import { useState } from "react";

import { disconnectAccountAction } from "@/lib/connections/actions";
import type { Platform } from "@/lib/platforms/types";

export type ConnectedAccountRow = { id: string; name: string };

export type PlatformRow = {
  id: Platform;
  label: string;
  /** Accounts already connected in this workspace. */
  connected: ConnectedAccountRow[];
  /** Adapter exists — false means genuinely not built yet. */
  buildable: boolean;
  /** Included in the plan. False renders the upgrade badge. */
  included: boolean;
  /** Why the plan excludes it, for the upgrade prompt. */
  reason?: string;
  /** Per-workspace account cap reached. */
  atAccountCap: boolean;
  capReason?: string;
};

// Platforms are toggles, never "Locked" labels. A plan that excludes one still
// shows it, wearing a 💎, and toggling opens an upgrade prompt — the point is
// that the user sees what upgrading buys rather than a dead row.
export function PlatformToggles({ rows }: { rows: PlatformRow[] }) {
  const [upsell, setUpsell] = useState<PlatformRow | null>(null);

  return (
    <>
      <ul className="mt-4 flex flex-col gap-1 text-sm">
        {rows.map((row) => {
          const on = row.connected.length > 0;
          const blocked = !row.included || row.atAccountCap;

          return (
            <li
              key={row.id}
              className="flex items-center justify-between gap-4 rounded-md px-2 py-2 transition hover:bg-neutral-900/60"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="font-medium">{row.label}</span>
                {!row.included ? (
                  <span
                    title={row.reason}
                    className="rounded-full border border-amber-800/60 bg-amber-950/40 px-1.5 py-0.5 text-[10px] font-medium text-amber-300"
                  >
                    💎 Upgrade
                  </span>
                ) : null}
                {row.connected.length > 0 ? (
                  <span className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5 text-xs text-neutral-500">
                    {row.connected.map((account, index) => (
                      <span key={account.id} className="flex items-center">
                        <span className="truncate">{account.name}</span>
                        <DisconnectButton account={account} platformLabel={row.label} />
                        {index < row.connected.length - 1 ? (
                          <span aria-hidden="true" className="mr-1 text-neutral-700">
                            ·
                          </span>
                        ) : null}
                      </span>
                    ))}
                  </span>
                ) : null}
              </span>

              {row.included && !row.buildable ? (
                <span className="shrink-0 text-xs text-neutral-600">
                  Coming soon
                </span>
              ) : (
                <Toggle
                  on={on}
                  blocked={blocked}
                  onBlockedClick={() => setUpsell(row)}
                  href={
                    blocked ? undefined : `/api/connect/${row.id}/start`
                  }
                  label={`${on ? "Connect another" : "Connect"} ${row.label}`}
                />
              )}
            </li>
          );
        })}
      </ul>

      {upsell ? (
        <UpgradeDialog row={upsell} onClose={() => setUpsell(null)} />
      ) : null}
    </>
  );
}

// The × beside each connected account. A real form post to a server action,
// so it works without JavaScript and the deletion is RLS-scoped on the
// server; the confirm() is only there to stop a stray click.
function DisconnectButton({
  account,
  platformLabel,
}: {
  account: ConnectedAccountRow;
  platformLabel: string;
}) {
  return (
    <form
      action={disconnectAccountAction}
      onSubmit={(event) => {
        if (
          !window.confirm(
            `Disconnect ${account.name} from ${platformLabel}? MarkedFox deletes its stored tokens; scheduled posts targeting it will fail until it is reconnected.`,
          )
        ) {
          event.preventDefault();
        }
      }}
      className="inline"
    >
      <input type="hidden" name="connection_id" value={account.id} />
      <button
        type="submit"
        aria-label={`Disconnect ${account.name} from ${platformLabel}`}
        title="Disconnect"
        className="rounded px-1 text-neutral-600 transition hover:bg-neutral-800 hover:text-red-300"
      >
        ×
      </button>
    </form>
  );
}

function Toggle({
  on,
  blocked,
  href,
  onBlockedClick,
  label,
}: {
  on: boolean;
  blocked: boolean;
  href?: string;
  onBlockedClick: () => void;
  label: string;
}) {
  const track = on
    ? "bg-emerald-600"
    : blocked
      ? "bg-neutral-800"
      : "bg-neutral-700";

  const knob = `inline-block h-4 w-4 transform rounded-full bg-white transition ${
    on ? "translate-x-5" : "translate-x-1"
  }`;

  // Blocked toggles are still buttons, not disabled controls: a disabled
  // switch tells the user nothing, whereas this one explains itself.
  if (blocked) {
    return (
      <button
        type="button"
        onClick={onBlockedClick}
        aria-label={label}
        className={`relative inline-flex h-5 w-10 shrink-0 items-center rounded-full transition ${track}`}
      >
        <span className={knob} />
      </button>
    );
  }

  return (
    <a
      href={href}
      aria-label={label}
      className={`relative inline-flex h-5 w-10 shrink-0 items-center rounded-full transition hover:brightness-110 ${track}`}
    >
      <span className={knob} />
    </a>
  );
}

function UpgradeDialog({
  row,
  onClose,
}: {
  row: PlatformRow;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-xl border border-neutral-800 bg-neutral-950 p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 className="text-lg font-semibold">
          {row.included ? "You are out of slots" : `${row.label} is on paid plans`}
        </h3>
        <p className="mt-2 text-sm text-neutral-400">
          {row.included ? row.capReason : row.reason}
        </p>

        {row.id === "x" ? (
          <p className="mt-3 rounded-md border border-neutral-800 bg-neutral-900/60 px-3 py-2 text-xs text-neutral-400">
            X is the one platform that charges per post, so it carries a monthly
            number on every plan rather than being unlimited.
          </p>
        ) : null}

        <div className="mt-5 flex gap-2">
          <a
            href="/pricing"
            className="rounded-md bg-neutral-50 px-3 py-2 text-sm font-semibold text-neutral-950 transition hover:bg-white"
          >
            See plans
          </a>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-neutral-800 px-3 py-2 text-sm text-neutral-300 transition hover:border-neutral-600"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
