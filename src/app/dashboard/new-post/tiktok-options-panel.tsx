"use client";

import { Icon, type IconName } from "@/components/icons";
import { PlatformBadge } from "@/components/platform-icon";
import { Toggle, cx } from "@/components/ui";
import {
  TIKTOK_PRIVACY_LABELS,
  tiktokConsentText,
  type TikTokCreatorContext,
  type TikTokPublishOptions,
} from "@/lib/platforms/tiktok-options";

// The TikTok section of the composer — every control TikTok's Direct Post
// integration guidelines require, in the order their reviewers look for it:
// who the post goes to, a privacy dropdown with no default, opt-in
// interaction toggles honouring creator_info, commercial-content disclosure,
// and the consent line. Validation messages come from the same pure
// function the server runs (see lib/platforms/tiktok-options.ts).
//
// It looks like the other platforms' sections now — same split, same rows,
// same switch — but nothing about what it *does* moved. Every one of those
// requirements is a thing a human reviewer checks, so this was a restyle with
// the behaviour held still on purpose: the privacy dropdown still opens on no
// selection, the three interaction switches are still opt-in and still respect
// what creator_info says the account allows, disclosure still reveals the two
// brand choices, and branded content still cannot be posted as "Only you".
// A checkbox became a Toggle; `checked`, `disabled` and `onChange` are the
// same values they were.

export type ContextState =
  | { status: "loading" }
  | { status: "ready"; context: TikTokCreatorContext }
  | { status: "error"; message: string };

export function TikTokOptionsPanel({
  accounts,
  contexts,
  options,
  onChange,
  hasVideo,
}: {
  accounts: { id: string; name: string }[];
  contexts: Record<string, ContextState>;
  options: TikTokPublishOptions;
  onChange: (next: TikTokPublishOptions) => void;
  hasVideo: boolean;
}) {
  const ready = accounts
    .map((a) => contexts[a.id])
    .filter((c): c is Extract<ContextState, { status: "ready" }> => c?.status === "ready")
    .map((c) => c.context);
  const allReady = ready.length === accounts.length && accounts.length > 0;
  const anyError = accounts.some((a) => contexts[a.id]?.status === "error");

  // A post goes to every selected TikTok account with one set of options, so
  // only a privacy level every one of them allows can be offered.
  const privacyOptions = allReady
    ? ready
        .map((c) => c.privacyLevelOptions)
        .reduce<string[]>((acc, list) => acc.filter((o) => list.includes(o)), ready[0].privacyLevelOptions)
    : [];
  const commentDisabled = ready.some((c) => c.commentDisabled);
  const duetDisabled = ready.some((c) => c.duetDisabled);
  const stitchDisabled = ready.some((c) => c.stitchDisabled);
  const maxDuration = ready
    .map((c) => c.maxVideoPostDurationSec)
    .filter((n): n is number => typeof n === "number")
    .reduce<number | undefined>((min, n) => (min === undefined ? n : Math.min(min, n)), undefined);

  const set = (patch: Partial<TikTokPublishOptions>) => onChange({ ...options, ...patch });
  const consent = tiktokConsentText(options);

  /** One row: glyph, label, control on the right — the same shape every other
   *  platform's settings use. */
  const row = (
    icon: IconName,
    label: string,
    control: React.ReactNode,
    opts: { dimmed?: boolean; note?: string } = {},
  ) => (
    <div className={cx("py-3", opts.dimmed && "opacity-50")}>
      <div className="flex items-center justify-between gap-4">
        <span className="flex min-w-0 items-center gap-2.5 text-sm text-pretty text-ink">
          <Icon name={icon} className="h-[17px] w-[17px] shrink-0 text-muted" />
          {label}
        </span>
        {control}
      </div>
      {opts.note ? (
        <p className="mt-1 pl-[27px] text-xs text-faint">{opts.note}</p>
      ) : null}
    </div>
  );

  return (
    <section
      className="grid gap-x-6 gap-y-3 border-t border-line py-6 wide:grid-cols-[minmax(0,190px)_minmax(0,1fr)]"
      aria-labelledby="tiktok-options-heading"
    >
      <div>
        <h3
          id="tiktok-options-heading"
          className="font-display flex items-center gap-2 text-[15.5px] font-bold tracking-[-0.01em] text-ink"
        >
          <PlatformBadge platform="tiktok" className="h-6 w-6 rounded-md" />
          Share on TikTok
        </h3>
        <p className="mt-1.5 text-[12.5px]/[18px] text-muted">
          These settings are only for TikTok. By posting, you agree to
          TikTok&apos;s{" "}
          {consent.links.map((link, index) => (
            <span key={link.href}>
              <a
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent underline"
              >
                {link.label}
              </a>
              {index < consent.links.length - 1 ? " and " : ""}
            </span>
          ))}
          .
        </p>

        {/* Who the post goes to, by the name TikTok knows them by. An audit
            requirement, not decoration — a reviewer looks for it. */}
        <ul className="mt-3 flex flex-col gap-1.5">
          {accounts.map((account) => {
            const state = contexts[account.id];
            return (
              <li
                key={account.id}
                className="flex items-center gap-2 text-[12px] text-muted"
              >
                {state?.status === "ready" && state.context.creatorAvatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- remote avatar host varies per creator
                  <img
                    src={state.context.creatorAvatarUrl}
                    alt=""
                    className="h-5 w-5 shrink-0 rounded-full"
                  />
                ) : (
                  <span
                    className="inline-block h-5 w-5 shrink-0 rounded-full bg-chip"
                    aria-hidden="true"
                  />
                )}
                <span className="min-w-0 truncate">
                  Posting to{" "}
                  <span className="font-semibold text-ink">
                    {state?.status === "ready"
                      ? (state.context.creatorNickname ?? account.name)
                      : account.name}
                  </span>
                  {state?.status === "ready" && state.context.creatorUsername
                    ? ` @${state.context.creatorUsername}`
                    : ""}
                </span>
                {state?.status === "loading" || !state ? (
                  <span className="shrink-0 text-faint">loading…</span>
                ) : null}
                {state?.status === "error" ? (
                  <span className="shrink-0 text-danger">{state.message}</span>
                ) : null}
              </li>
            );
          })}
        </ul>

        {hasVideo && maxDuration ? (
          <p className="mt-3 text-xs text-faint">
            Videos up to {Math.round(maxDuration / 60)} minutes ({maxDuration}s)
            for this account.
          </p>
        ) : null}
      </div>

      <div className="flex flex-col divide-y divide-line">
        {/* No preselected privacy: TikTok's guidelines require the person to
            choose, so the empty option is the initial value and stays. */}
        <div className="py-3">
          <div className="flex items-center justify-between gap-4">
            <label
              htmlFor="tiktok-privacy"
              className="flex min-w-0 items-center gap-2.5 text-sm text-ink"
            >
              <Icon name="eye" className="h-[17px] w-[17px] shrink-0 text-muted" />
              Who can see this post
            </label>
            <select
              id="tiktok-privacy"
              value={options.privacy_level ?? ""}
              disabled={!allReady}
              onChange={(e) => set({ privacy_level: e.target.value || undefined })}
              className="max-w-[55%] shrink-0 cursor-pointer truncate rounded-lg border-0 bg-transparent py-1 pr-1 text-right text-sm text-muted outline-none hover:text-ink focus:text-ink disabled:cursor-not-allowed disabled:opacity-60"
            >
              <option value="">
                {/* These three strings are pinned by tiktok-options-panel's
                    tests, which stand in for what the audit reviewer reads.
                    Shortening them for the narrower column was the kind of
                    "just a restyle" change that is not one. */}
                {allReady
                  ? "Choose…"
                  : anyError
                    ? "Unavailable — see above"
                    : "Loading account details…"}
              </option>
              {privacyOptions.map((level) => (
                <option
                  key={level}
                  value={level}
                  disabled={level === "SELF_ONLY" && Boolean(options.brand_content)}
                >
                  {TIKTOK_PRIVACY_LABELS[level] ?? level}
                  {level === "SELF_ONLY" && options.brand_content
                    ? " — not available for branded content"
                    : ""}
                </option>
              ))}
            </select>
          </div>
          {allReady && privacyOptions.length === 0 ? (
            <p className="mt-1 pl-[27px] text-xs text-danger">
              These accounts share no allowed visibility — post to them
              separately.
            </p>
          ) : null}
        </div>

        {/* Opt-in, and greyed out when creator_info says the account has them
            switched off. Both are audit requirements. */}
        {row(
          "chat",
          "Allow Comments",
          <Toggle
            on={Boolean(options.allow_comment)}
            disabled={commentDisabled}
            label="Allow comments"
            onClick={() => set({ allow_comment: !options.allow_comment })}
          />,
          {
            dimmed: commentDisabled,
            note: commentDisabled
              ? "Turned off in the account's TikTok settings."
              : undefined,
          },
        )}
        {hasVideo
          ? row(
              "people",
              "Allow Duet",
              <Toggle
                on={Boolean(options.allow_duet)}
                disabled={duetDisabled}
                label="Allow duet"
                onClick={() => set({ allow_duet: !options.allow_duet })}
              />,
              {
                dimmed: duetDisabled,
                note: duetDisabled
                  ? "Turned off in the account's TikTok settings."
                  : undefined,
              },
            )
          : null}
        {hasVideo
          ? row(
              "link",
              "Allow Stitch",
              <Toggle
                on={Boolean(options.allow_stitch)}
                disabled={stitchDisabled}
                label="Allow stitch"
                onClick={() => set({ allow_stitch: !options.allow_stitch })}
              />,
              {
                dimmed: stitchDisabled,
                note: stitchDisabled
                  ? "Turned off in the account's TikTok settings."
                  : undefined,
              },
            )
          : null}

        {/* Disclosure, and the two brand choices it reveals. */}
        <div className="py-3">
          <div className="flex items-center justify-between gap-4">
            <span className="flex min-w-0 items-center gap-2.5 text-sm text-ink">
              <Icon name="card" className="h-[17px] w-[17px] shrink-0 text-muted" />
              Disclose video content
            </span>
            <Toggle
              on={Boolean(options.disclose_commercial)}
              label="Disclose commercial content"
              onClick={() =>
                set(
                  options.disclose_commercial
                    ? {
                        disclose_commercial: false,
                        brand_organic: false,
                        brand_content: false,
                      }
                    : { disclose_commercial: true },
                )
              }
            />
          </div>
          <p className="mt-1 pl-[27px] text-xs/[17px] text-faint">
            Turn on to disclose that this video promotes goods or services in
            exchange for something of value. Your video could promote yourself,
            a third party, or both.
          </p>

          {options.disclose_commercial ? (
            <div className="mt-2.5 flex flex-col gap-2.5 pl-[27px]">
              <label className="flex cursor-pointer items-start gap-2.5">
                <input
                  type="checkbox"
                  className="mt-[3px] h-[15px] w-[15px] accent-[var(--accent)]"
                  checked={Boolean(options.brand_organic)}
                  onChange={(e) => set({ brand_organic: e.target.checked })}
                />
                <span className="text-sm text-ink">
                  Your brand
                  <span className="mt-0.5 block text-xs/[17px] text-faint">
                    You are promoting yourself or your own business. TikTok
                    labels this &ldquo;Promotional content&rdquo;.
                  </span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-2.5">
                <input
                  type="checkbox"
                  className="mt-[3px] h-[15px] w-[15px] accent-[var(--accent)]"
                  checked={Boolean(options.brand_content)}
                  onChange={(e) => set({ brand_content: e.target.checked })}
                />
                <span className="text-sm text-ink">
                  Branded content
                  <span className="mt-0.5 block text-xs/[17px] text-faint">
                    You are promoting another brand or a third party. TikTok
                    labels this &ldquo;Paid partnership&rdquo; and it cannot be
                    posted as &ldquo;Only you&rdquo;.
                  </span>
                </span>
              </label>
              {options.brand_content || options.brand_organic ? (
                <p className="text-xs text-muted">
                  Your post will be labeled{" "}
                  <span className="font-semibold text-ink">
                    {options.brand_content
                      ? "Paid partnership"
                      : "Promotional content"}
                  </span>
                  .
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
