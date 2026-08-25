"use client";

import { useState } from "react";

import { Icon, PlanDiamond } from "@/components/icons";
import { overlayProps, useEscape } from "@/components/overlay";
import { PlatformTile } from "@/components/platform-icon";
import { Button, ButtonLink, FoxMark, Pill, cx } from "@/components/ui";
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
      <ul className="flex flex-col">
        {rows.map((row) => {
          const on = row.connected.length > 0;
          const blocked = !row.included || row.atAccountCap || !row.configured;

          return (
            <li
              key={row.id}
              className="flex items-center gap-4 border-t border-line py-4 first:border-t-0 first:pt-0 last:pb-0"
            >
              <PlatformTile platform={row.id} size={40} />

              <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-[15px] font-semibold text-ink">
                    {row.label}
                  </span>

                  {on ? (
                    <Pill tone="ok">
                      <span
                        aria-hidden
                        className="h-[6px] w-[6px] rounded-full bg-ok"
                      />
                      Connected
                    </Pill>
                  ) : !row.included && row.upgradeNote ? (
                    <Pill tone="accent" title={row.reason}>
                      <PlanDiamond className="h-2.5 w-2.5" />
                      {row.upgradeNote}
                    </Pill>
                  ) : !row.configured ? (
                    <Pill tone="info" title={row.configReason}>
                      Setup needed
                    </Pill>
                  ) : (
                    <Pill tone="neutral">Not connected</Pill>
                  )}
                </span>

                {row.connected.length > 0 ? (
                  <span className="flex flex-wrap items-center gap-1.5">
                    {row.connected.map((account) => (
                      <span
                        key={account.id}
                        className="inline-flex max-w-[14rem] items-center gap-1 rounded-full bg-chip py-1 pr-1.5 pl-2.5 text-[12.5px] text-muted"
                      >
                        <span className="truncate">{account.name}</span>
                        <DisconnectButton
                          account={account}
                          platformLabel={row.label}
                        />
                      </span>
                    ))}
                  </span>
                ) : null}

                {/* One sentence saying what this row's state actually means.
                    A badge alone reads as a status; the sentence is what tells
                    somebody what to do next. */}
                <span className="text-[13px]/[19px] text-pretty text-faint">
                  {row.included && row.note
                    ? row.note
                    : !row.included
                      ? row.reason
                      : !row.configured
                        ? row.configReason
                        : on
                          ? "Posting and reading work. Toggle to add another account."
                          : `Connect to publish to ${row.label} from the composer.`}
                </span>
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
        className="rounded-sm p-0.5 text-faint transition-[color] duration-110 hover:text-danger"
      >
        <Icon name="close" className="h-3 w-3" />
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
  // The accent, not success green. `ui.tsx` reversed the shared switch to the
  // accent on exactly this reasoning — a green switch beside an orange button
  // is two loud colours arguing — and this copy of it was missed, so the one
  // screen a new user spends the most time on was the one screen with a
  // different "on" colour.
  const track = cx(
    "relative block h-[26px] w-[46px] shrink-0 rounded-full transition-[background-color] duration-110",
    on ? "bg-accent" : "bg-line hover:bg-line-strong",
  );
  const knob = cx(
    "absolute top-[3px] left-0 h-5 w-5 rounded-full bg-white shadow-e1 transition-transform duration-110",
    on ? "translate-x-[23px]" : "translate-x-[3px]",
  );

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
        <span aria-hidden className={knob} />
      </button>
    );
  }

  return (
    <a
      href={href}
      aria-label={label}
      className={track}
    >
      <span aria-hidden className={knob} />
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
  useEscape(onClose);

  return (
    <div {...overlayProps(onClose, "centre", "z-50")} role="dialog" aria-modal="true">
      <div className="mf-modal w-full max-w-[400px] rounded-2xl border border-line bg-panel p-6 shadow-e2">
        <FoxMark className="h-[38px]" />
        <h3 className="font-display mt-3 text-[19px] font-bold tracking-[-0.01em] text-ink">
          {!row.included
            ? `${row.label} is on paid plans`
            : !row.configured
              ? `${row.label} is not switched on yet`
              : "You are out of slots"}
        </h3>
        <p className="mt-2.5 text-[14.5px]/[22px] text-pretty text-muted">
          {!row.included
            ? row.reason
            : !row.configured
              ? row.configReason
              : row.capReason}
        </p>

        {row.included && !row.configured ? (
          <p className="mt-4 rounded-lg border border-line bg-chip px-3.5 py-3 text-[13px]/[19px] text-pretty text-muted">
            Nothing is wrong with your account — this one needs a developer app
            and its keys added to the deployment before anybody can connect it.
            Everything else on the list works today.
          </p>
        ) : null}

        {row.id === "x" ? (
          <p className="mt-4 rounded-lg border border-line bg-chip px-3.5 py-3 text-[13px]/[19px] text-pretty text-muted">
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
