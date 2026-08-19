"use client";

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

  return (
    <section className="rounded-lg border border-neutral-900 p-4" aria-labelledby="tiktok-options-heading">
      <h2 id="tiktok-options-heading" className="text-sm font-medium text-neutral-300">
        TikTok settings
      </h2>

      {/* who */}
      <ul className="mt-3 flex flex-col gap-1.5 text-sm">
        {accounts.map((account) => {
          const state = contexts[account.id];
          return (
            <li key={account.id} className="flex items-center gap-2 text-neutral-300">
              {state?.status === "ready" && state.context.creatorAvatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- remote avatar host varies per creator
                <img
                  src={state.context.creatorAvatarUrl}
                  alt=""
                  className="h-6 w-6 rounded-full"
                />
              ) : (
                <span className="inline-block h-6 w-6 rounded-full bg-neutral-800" aria-hidden="true" />
              )}
              <span>
                Posting to{" "}
                <span className="font-medium text-neutral-100">
                  {state?.status === "ready"
                    ? (state.context.creatorNickname ?? account.name)
                    : account.name}
                </span>
                {state?.status === "ready" && state.context.creatorUsername ? (
                  <span className="text-neutral-500"> @{state.context.creatorUsername}</span>
                ) : null}
              </span>
              {state?.status === "loading" || !state ? (
                <span className="text-xs text-neutral-500">loading…</span>
              ) : null}
              {state?.status === "error" ? (
                <span className="text-xs text-red-400">{state.message}</span>
              ) : null}
            </li>
          );
        })}
      </ul>

      {/* privacy */}
      <div className="mt-4">
        <label htmlFor="tiktok-privacy" className="text-sm text-neutral-300">
          Who can view this post
        </label>
        <select
          id="tiktok-privacy"
          value={options.privacy_level ?? ""}
          disabled={!allReady}
          onChange={(e) => set({ privacy_level: e.target.value || undefined })}
          className="mt-1 block w-full max-w-xs rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-50 outline-none focus:border-neutral-500 disabled:opacity-50"
        >
          <option value="">
            {allReady ? "Choose…" : anyError ? "Unavailable — see above" : "Loading account details…"}
          </option>
          {privacyOptions.map((level) => (
            <option
              key={level}
              value={level}
              disabled={level === "SELF_ONLY" && Boolean(options.brand_content)}
            >
              {TIKTOK_PRIVACY_LABELS[level] ?? level}
              {level === "SELF_ONLY" && options.brand_content ? " — not available for branded content" : ""}
            </option>
          ))}
        </select>
        {allReady && privacyOptions.length === 0 ? (
          <p className="mt-1 text-xs text-red-400">
            These accounts share no allowed visibility — post to them separately.
          </p>
        ) : null}
      </div>

      {/* interactions */}
      <fieldset className="mt-4">
        <legend className="text-sm text-neutral-300">Allow users to</legend>
        <div className="mt-1 flex flex-wrap gap-4 text-sm text-neutral-300">
          <label className={`flex items-center gap-2 ${commentDisabled ? "opacity-50" : ""}`}>
            <input
              type="checkbox"
              className="accent-emerald-500"
              checked={Boolean(options.allow_comment)}
              disabled={commentDisabled}
              onChange={(e) => set({ allow_comment: e.target.checked })}
            />
            Comment
          </label>
          {hasVideo ? (
            <>
              <label className={`flex items-center gap-2 ${duetDisabled ? "opacity-50" : ""}`}>
                <input
                  type="checkbox"
                  className="accent-emerald-500"
                  checked={Boolean(options.allow_duet)}
                  disabled={duetDisabled}
                  onChange={(e) => set({ allow_duet: e.target.checked })}
                />
                Duet
              </label>
              <label className={`flex items-center gap-2 ${stitchDisabled ? "opacity-50" : ""}`}>
                <input
                  type="checkbox"
                  className="accent-emerald-500"
                  checked={Boolean(options.allow_stitch)}
                  disabled={stitchDisabled}
                  onChange={(e) => set({ allow_stitch: e.target.checked })}
                />
                Stitch
              </label>
            </>
          ) : null}
        </div>
        {commentDisabled || (hasVideo && (duetDisabled || stitchDisabled)) ? (
          <p className="mt-1 text-xs text-neutral-500">
            Greyed-out options are turned off in the account&apos;s TikTok settings.
          </p>
        ) : null}
      </fieldset>

      {/* commercial content */}
      <fieldset className="mt-4">
        <label className="flex items-center gap-2 text-sm text-neutral-300">
          <input
            type="checkbox"
            className="accent-emerald-500"
            checked={Boolean(options.disclose_commercial)}
            onChange={(e) =>
              set(
                e.target.checked
                  ? { disclose_commercial: true }
                  : { disclose_commercial: false, brand_organic: false, brand_content: false },
              )
            }
          />
          Disclose commercial content
        </label>
        <p className="mt-1 text-xs text-neutral-500">
          Turn this on if the post promotes yourself, your business, or a brand or
          third party in exchange for something of value.
        </p>
        {options.disclose_commercial ? (
          <div className="mt-2 flex flex-col gap-2 pl-6 text-sm text-neutral-300">
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                className="mt-0.5 accent-emerald-500"
                checked={Boolean(options.brand_organic)}
                onChange={(e) => set({ brand_organic: e.target.checked })}
              />
              <span>
                Your brand
                <span className="block text-xs text-neutral-500">
                  You are promoting yourself or your own business. TikTok labels this
                  &ldquo;Promotional content&rdquo;.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                className="mt-0.5 accent-emerald-500"
                checked={Boolean(options.brand_content)}
                onChange={(e) => set({ brand_content: e.target.checked })}
              />
              <span>
                Branded content
                <span className="block text-xs text-neutral-500">
                  You are promoting another brand or a third party. TikTok labels this
                  &ldquo;Paid partnership&rdquo; and it cannot be posted as &ldquo;Only you&rdquo;.
                </span>
              </span>
            </label>
            {options.brand_content || options.brand_organic ? (
              <p className="text-xs text-neutral-400">
                Your post will be labeled{" "}
                <span className="font-medium text-neutral-200">
                  {options.brand_content ? "Paid partnership" : "Promotional content"}
                </span>
                .
              </p>
            ) : null}
          </div>
        ) : null}
      </fieldset>

      {hasVideo && maxDuration ? (
        <p className="mt-4 text-xs text-neutral-500">
          Videos up to {Math.round(maxDuration / 60)} minutes ({maxDuration}s) for this account.
        </p>
      ) : null}

      {/* consent */}
      <p className="mt-4 text-xs text-neutral-400">
        {consent.prefix}{" "}
        {consent.links.map((link, index) => (
          <span key={link.href}>
            <a href={link.href} target="_blank" rel="noopener noreferrer" className="underline">
              {link.label}
            </a>
            {index < consent.links.length - 1 ? " and " : ""}
          </span>
        ))}
        .
      </p>
    </section>
  );
}
