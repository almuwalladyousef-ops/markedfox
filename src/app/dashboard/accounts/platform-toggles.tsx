"use client";

import { useState } from "react";

import { Button, ButtonLink, FoxMark } from "@/components/ui";
import { disconnectAccountAction } from "@/lib/connections/actions";
import type { Platform } from "@/lib/platforms/types";

export type ConnectedAccountRow = { id: string; name: string };

export type PlatformRow = {
  id: Platform;
  label: string;
  /** Accounts already connected in this workspace. */
  connected: ConnectedAccountRow[];
  /** An adapter exists AND its credentials are on this deployment, so
   *  pressing Connect can actually reach the platform. */
  configured: boolean;
  /** What is missing when it is not, in the owner's terms. */
  configReason?: string;
  /** Included in the plan. False renders the upgrade badge. */
  included: boolean;
  /** Why the plan excludes it, for the upgrade prompt. */
  reason?: string;
  /** Per-workspace account cap reached. */
  atAccountCap: boolean;
  capReason?: string;
  /** What upgrading buys, e.g. "On Pro · 300/mo". Shown when the plan excludes
   *  this platform, in place of a dead row. */
  upgradeNote?: string;
  /** A standing caveat on a platform the plan does include — today only X,
   *  whose monthly number is never "unlimited". */
  note?: string;
};

// Every platform is a toggle. Not one of them is ever a label.
//
// There are three reasons a toggle cannot connect today — the plan excludes it,
// the workspace is at its account cap, or this deployment has no credentials
// for it yet — and all three render as the same switch. Pressing it says which
// one and what to do about it.
//
// The rule is worth stating plainly because the tempting alternative keeps
// coming back: a greyed-out row reading "Coming soon" tells the user nothing
// they can act on, hides half of what the product does from somebody deciding
// whether to pay for it, and quietly becomes a lie the day the credentials
// land.
export function PlatformToggles({ rows }: { rows: PlatformRow[] }) {
  const [upsell, setUpsell] = useState<PlatformRow | null>(null);

  return (
    <>
      <ul className="mt-3 flex flex-col">
        {rows.map((row) => {
          const on = row.connected.length > 0;
          const blocked = !row.included || row.atAccountCap || !row.configured;

          return (
            <li
              key={row.id}
              className="flex items-center justify-between gap-4 border-t border-line px-1.5 py-[11px] first:border-t-0"
            >
              <span className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="text-[13.5px] font-semibold text-ink">
                  {row.label}
                </span>

                {row.connected.map((account) => (
                  <span
                    key={account.id}
                    className="inline-flex max-w-[14rem] items-center gap-1 rounded-full bg-chip py-1 pr-1.5 pl-2.5 text-[11.5px] text-muted"
                  >
                    <span className="truncate">{account.name}</span>
                    <DisconnectButton
                      account={account}
                      platformLabel={row.label}
                    />
                  </span>
                ))}

                {!row.included && row.upgradeNote ? (
                  <span
                    title={row.reason}
                    className="rounded-full bg-accent-soft px-2 py-[3px] text-[11px] font-semibold text-accent"
                  >
                    💎 {row.upgradeNote}
                  </span>
                ) : null}

                {row.included && !row.configured ? (
                  <span
                    title={row.configReason}
                    className="rounded-full bg-sky-soft px-2 py-[3px] text-[11px] font-semibold text-sky"
                  >
                    Setup needed
                  </span>
                ) : null}

                {row.included && row.note ? (
                  <span className="text-[11.5px] text-faint">{row.note}</span>
                ) : null}
              </span>

              <Toggle
                on={on}
                blocked={blocked}
                onBlockedClick={() => setUpsell(row)}
                href={blocked ? undefined : `/api/connect/${row.id}/start`}
                label={`${on ? "Connect another" : "Connect"} ${row.label}`}
              />
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
        className="rounded px-0.5 text-faint transition hover:text-danger"
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
  const track = `relative inline-flex h-[22px] w-10 shrink-0 items-center rounded-full transition ${
    on ? "bg-ok" : "bg-chip"
  }`;
  const knob = `inline-block h-4 w-4 rounded-full shadow-[0_1px_3px_rgba(0,0,0,.3)] transition-transform duration-150 ${
    on ? "translate-x-[21px] bg-white" : "translate-x-[3px] bg-faint"
  }`;

  // Blocked toggles are still buttons, not disabled controls: a disabled
  // switch tells the user nothing, whereas this one explains itself.
  if (blocked) {
    return (
      <button
        type="button"
        onClick={onBlockedClick}
        aria-label={label}
        className={track}
      >
        <span className={knob} />
      </button>
    );
  }

  return (
    <a
      href={href}
      aria-label={label}
      className={`${track} hover:brightness-[1.08]`}
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[400px] rounded-2xl border border-line bg-panel p-6 shadow-panel"
        onClick={(event) => event.stopPropagation()}
      >
        <FoxMark className="h-[38px]" />
        <h3 className="font-display mt-3 text-lg font-semibold text-ink">
          {!row.included
            ? `${row.label} is on paid plans`
            : !row.configured
              ? `${row.label} is not switched on yet`
              : "You are out of slots"}
        </h3>
        <p className="mt-2 text-[13.5px]/[20px] text-muted">
          {!row.included
            ? row.reason
            : !row.configured
              ? row.configReason
              : row.capReason}
        </p>

        {row.included && !row.configured ? (
          <p className="mt-3 rounded-lg border border-line bg-chip px-3 py-2 text-xs text-muted">
            Nothing is wrong with your account — this one needs a developer app
            and its keys added to the deployment before anybody can connect it.
            Everything else on the list works today.
          </p>
        ) : null}

        {row.id === "x" ? (
          <p className="mt-3 rounded-lg border border-line bg-chip px-3 py-2 text-xs text-muted">
            X charges $0.015 per post through its API — and 13x more with an
            external link — so X carries a hard monthly number on every plan
            rather than being unlimited.
          </p>
        ) : null}

        <div className="mt-5 flex gap-2">
          {/* An unconfigured platform is not something a plan fixes, so it
              does not get a "See plans" button pointing at a purchase that
              would change nothing. */}
          {row.included && !row.configured ? null : (
            <ButtonLink href="/pricing" tone="primary">
              See plans
            </ButtonLink>
          )}
          <Button type="button" onClick={onClose}>
            {row.included && !row.configured ? "Close" : "Not now"}
          </Button>
        </div>
      </div>
    </div>
  );
}
