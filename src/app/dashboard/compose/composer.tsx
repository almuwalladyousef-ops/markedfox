"use client";

import { useMemo, useState } from "react";

import type { MediaRef, Platform } from "@/lib/platforms/types";
import { containsExternalLink } from "@/lib/publish/links";
import type { ContentSpecs } from "@/lib/publish/specs";
import type { TargetOutcome } from "@/lib/publish/types";
import { captionLength, validateContent } from "@/lib/publish/validate";

// The composer. One caption, any combination of connected accounts, optional
// per-platform caption overrides, publish now or schedule.
//
// Every rule the API enforces is checked here first, live, with the same
// functions and the same numbers (the specs come from the adapters via the
// server page). The submit button is disabled while anything is wrong, and the
// list above it says exactly what — "surfaced before publish, never as an
// error after". The API still re-checks everything; this is the echo, not the
// gate.

export type ComposerAccount = {
  id: string;
  platform: Platform;
  name: string;
  status: "active" | "expired" | "revoked" | "error";
  /** An adapter exists for this platform. */
  publishable: boolean;
};

export type PlatformGate = { code: string; message: string };

type Props = {
  workspaceId: string;
  accounts: ComposerAccount[];
  specs: ContentSpecs;
  labels: Record<Platform, string>;
  gates: Partial<Record<string, PlatformGate>>;
  planId: string;
  xLinksAllowed: boolean;
  /** R2 is provisioned, so the file picker can be offered. */
  uploadsEnabled: boolean;
  usage: {
    postsToday: number;
    postsPerDay: number | null;
    xPostsThisMonth: number;
    xPostsPerMonth: number;
  };
};

type MediaRow = {
  key: number;
  url: string;
  type: MediaRef["type"];
  /** Set while bytes are in flight, 0–100. */
  progress?: number;
  /** Upload failure, shown on the row itself. */
  error?: string;
  /** Filename, so an uploaded row reads as the file rather than a long URL. */
  name?: string;
};

type Issue = { platform: Platform | null; message: string };

type Outcome =
  | { kind: "scheduled"; id: string; scheduledFor: string }
  | { kind: "published"; status: "published" | "partial" | "failed"; results: TargetOutcome[] }
  | { kind: "error"; message: string; details: string[] };

const VIDEO_EXTENSIONS = /\.(mp4|mov|m4v|webm|mkv|avi)(\?.*)?$/i;

// datetime-local wants "YYYY-MM-DDTHH:MM" in local time.
function toLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function Composer({
  workspaceId,
  accounts,
  specs,
  labels,
  gates,
  planId,
  xLinksAllowed,
  uploadsEnabled,
  usage,
}: Props) {
  const [caption, setCaption] = useState("");
  const [media, setMedia] = useState<MediaRow[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [overrides, setOverrides] = useState<Partial<Record<Platform, string>>>({});
  const [mode, setMode] = useState<"now" | "schedule">("now");
  const [scheduledFor, setScheduledFor] = useState("");
  // The picker's lower bound. Set from event handlers, never during render —
  // the clock is impure and React wants render idempotent.
  const [minSchedule, setMinSchedule] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [nextKey, setNextKey] = useState(1);

  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const selectedPlatforms = useMemo(() => {
    const set = new Set<Platform>();
    for (const id of selected) {
      const account = accountById.get(id);
      if (account) set.add(account.platform);
    }
    return Array.from(set);
  }, [selected, accountById]);

  // Rows still uploading have no URL yet, so they are not offered to
  // validation — an in-flight file must not read as "no media".
  const mediaRefs: MediaRef[] = useMemo(
    () => media.filter((m) => m.url.trim()).map((m) => ({ url: m.url.trim(), type: m.type })),
    [media],
  );
  const uploading = media.some((m) => m.progress !== undefined);

  const captionFor = (platform: Platform) => overrides[platform] ?? caption;

  // ── live validation ────────────────────────────────────────────────────
  const issues: Issue[] = useMemo(() => {
    const out: Issue[] = [];
    const captionOf = (platform: Platform) => overrides[platform] ?? caption;
    for (const platform of selectedPlatforms) {
      const spec = specs[platform];
      if (!spec) continue;
      for (const issue of validateContent(spec, { caption: captionOf(platform), media: mediaRefs })) {
        out.push({ platform, message: issue.message });
      }
      if (platform === "x" && !xLinksAllowed && containsExternalLink(captionOf(platform))) {
        out.push({
          platform,
          message: "Posts to X cannot contain links — X charges 13x more for them, so no plan allows it.",
        });
      }
    }
    if (mode === "now") {
      if (usage.postsPerDay !== null && usage.postsToday >= usage.postsPerDay) {
        out.push({
          platform: null,
          message: `You have used today's ${usage.postsPerDay} posts on the ${planId} plan. Schedule it for later, or upgrade.`,
        });
      }
      if (selectedPlatforms.includes("x") && usage.xPostsThisMonth >= usage.xPostsPerMonth) {
        out.push({
          platform: "x",
          message: `X posts are capped at ${usage.xPostsPerMonth} a month and this month's are used.`,
        });
      }
    }
    if (mode === "schedule" && !scheduledFor) {
      out.push({ platform: null, message: "Pick a date and time." });
    }
    if (uploading) {
      out.push({ platform: null, message: "Wait for the upload to finish." });
    }
    for (const row of media) {
      if (row.error) out.push({ platform: null, message: row.error });
    }
    return out;
  }, [selectedPlatforms, specs, caption, overrides, mediaRefs, media, uploading, mode, scheduledFor, xLinksAllowed, usage, planId]);

  const canSubmit = selected.length > 0 && issues.length === 0 && !submitting;

  // ── handlers ───────────────────────────────────────────────────────────
  const toggleAccount = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const addMedia = () => {
    setMedia((prev) => [...prev, { key: nextKey, url: "", type: "image" }]);
    setNextKey((k) => k + 1);
  };
  const updateMedia = (key: number, patch: Partial<MediaRow>) =>
    setMedia((prev) => prev.map((m) => (m.key === key ? { ...m, ...patch } : m)));
  const removeMedia = (key: number) => setMedia((prev) => prev.filter((m) => m.key !== key));

  // Upload straight to R2 with a URL the server signs. The bytes never pass
  // through our box — see /api/media/upload-url. XMLHttpRequest rather than
  // fetch purely because it reports progress, which matters for a 200MB video.
  const uploadFile = (file: File) => {
    const rowKey = nextKey;
    setNextKey((k) => k + 1);
    setMedia((prev) => [
      ...prev,
      {
        key: rowKey,
        url: "",
        type: file.type.startsWith("video/") ? "video" : "image",
        progress: 0,
        name: file.name,
      },
    ]);

    void (async () => {
      try {
        const response = await fetch("/api/media/upload-url", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            workspaceId,
            contentType: file.type,
            sizeBytes: file.size,
          }),
        });
        const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
        if (!response.ok) {
          updateMedia(rowKey, {
            progress: undefined,
            error: String(body.message ?? "That file was refused."),
          });
          return;
        }

        const { uploadUrl, publicUrl, headers, kind } = body as {
          uploadUrl: string;
          publicUrl: string;
          headers: Record<string, string>;
          kind: MediaRef["type"];
        };

        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("PUT", uploadUrl);
          for (const [name, value] of Object.entries(headers)) {
            xhr.setRequestHeader(name, value);
          }
          xhr.upload.onprogress = (event) => {
            if (!event.lengthComputable) return;
            updateMedia(rowKey, {
              progress: Math.round((event.loaded / event.total) * 100),
            });
          };
          xhr.onload = () =>
            xhr.status >= 200 && xhr.status < 300
              ? resolve()
              : reject(new Error(`Upload failed (HTTP ${xhr.status}).`));
          xhr.onerror = () => reject(new Error("Upload failed — check your connection."));
          xhr.send(file);
        });

        updateMedia(rowKey, {
          url: publicUrl,
          type: kind,
          progress: undefined,
          error: undefined,
        });
      } catch (error) {
        updateMedia(rowKey, {
          progress: undefined,
          error: error instanceof Error ? error.message : "Upload failed.",
        });
      }
    })();
  };

  const submit = async () => {
    if (!canSubmit) return;
    if (mode === "schedule" && new Date(scheduledFor).getTime() <= Date.now()) {
      setOutcome({ kind: "error", message: "That time has already passed. Pick a later one.", details: [] });
      return;
    }
    setSubmitting(true);
    setOutcome(null);
    try {
      const platformOverrides: Record<string, { caption: string }> = {};
      for (const platform of selectedPlatforms) {
        const override = overrides[platform];
        if (override !== undefined) platformOverrides[platform] = { caption: override };
      }
      const response = await fetch("/api/posts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          caption,
          media: mediaRefs,
          targetConnectionIds: selected,
          platformOverrides,
          scheduledFor: mode === "schedule" ? new Date(scheduledFor).toISOString() : null,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;

      if (response.status === 201) {
        const post = body.post as { id: string; scheduledFor: string };
        setOutcome({ kind: "scheduled", id: post.id, scheduledFor: post.scheduledFor });
        return;
      }
      if (response.ok) {
        const post = body.post as { id: string; status: "published" | "partial" | "failed" };
        setOutcome({
          kind: "published",
          status: post.status,
          results: (body.results as TargetOutcome[]) ?? [],
        });
        return;
      }
      const details = Array.isArray(body.issues)
        ? (body.issues as Record<string, unknown>[]).map((i) => String(i.message ?? i.code ?? ""))
        : [];
      setOutcome({
        kind: "error",
        message:
          response.status === 401
            ? "Your session expired — sign in again."
            : response.status === 403
              ? "Your plan does not allow this post."
              : response.status === 422 || response.status === 400
                ? "The post was not accepted."
                : `Something went wrong (HTTP ${response.status}).`,
        details,
      });
    } catch (error) {
      setOutcome({
        kind: "error",
        message: "Could not reach the server.",
        details: [error instanceof Error ? error.message : String(error)],
      });
    } finally {
      setSubmitting(false);
    }
  };

  // ── render ────────────────────────────────────────────────────────────
  const grouped = useMemo(() => {
    const map = new Map<Platform, ComposerAccount[]>();
    for (const account of accounts) {
      const list = map.get(account.platform) ?? [];
      list.push(account);
      map.set(account.platform, list);
    }
    return Array.from(map.entries());
  }, [accounts]);

  return (
    <div className="flex flex-col gap-6">
      {/* accounts */}
      <section className="rounded-lg border border-neutral-900 p-4">
        <h2 className="text-sm font-medium text-neutral-300">Post to</h2>
        <ul className="mt-3 flex flex-col gap-3">
          {grouped.map(([platform, list]) => {
            const gate = gates[platform];
            return (
              <li key={platform}>
                <p className="flex items-center gap-2 text-xs uppercase tracking-wide text-neutral-500">
                  {labels[platform]}
                  {gate ? (
                    <span
                      title={gate.message}
                      className="rounded-full border border-amber-800/60 bg-amber-950/40 px-1.5 py-0.5 text-[10px] font-medium normal-case tracking-normal text-amber-300"
                    >
                      💎 Upgrade
                    </span>
                  ) : null}
                </p>
                <ul className="mt-1 flex flex-wrap gap-2">
                  {list.map((account) => {
                    const disabledReason = gate
                      ? gate.message
                      : account.status !== "active"
                        ? "Reconnect this account on the dashboard first."
                        : !account.publishable
                          ? "Publishing to this platform is not available yet."
                          : null;
                    const checked = selected.includes(account.id);
                    return (
                      <li key={account.id}>
                        <label
                          title={disabledReason ?? undefined}
                          className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition ${
                            checked
                              ? "border-emerald-700 bg-emerald-950/40 text-neutral-50"
                              : "border-neutral-800 text-neutral-300 hover:border-neutral-600"
                          } ${disabledReason ? "cursor-not-allowed opacity-50" : ""}`}
                        >
                          <input
                            type="checkbox"
                            className="accent-emerald-500"
                            checked={checked}
                            disabled={Boolean(disabledReason)}
                            onChange={() => toggleAccount(account.id)}
                          />
                          <span>{account.name}</span>
                          {account.status !== "active" ? (
                            <span className="text-xs text-red-400">reconnect</span>
                          ) : null}
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </li>
            );
          })}
        </ul>
      </section>

      {/* caption */}
      <section className="rounded-lg border border-neutral-900 p-4">
        <label htmlFor="caption" className="text-sm font-medium text-neutral-300">
          Caption
        </label>
        <textarea
          id="caption"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          rows={6}
          placeholder="What do you want to say?"
          className="mt-2 w-full rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-neutral-50 outline-none transition focus:border-neutral-500"
        />
        {selectedPlatforms.length > 0 ? (
          <ul className="mt-2 flex flex-wrap gap-3 text-xs">
            {selectedPlatforms.map((platform) => {
              const spec = specs[platform];
              if (!spec) return null;
              const length = captionLength(captionFor(platform));
              const over = length > spec.rules.captionMaxChars;
              return (
                <li key={platform} className={over ? "text-red-400" : "text-neutral-500"}>
                  {labels[platform]} {length.toLocaleString()}/{spec.rules.captionMaxChars.toLocaleString()}
                  {overrides[platform] !== undefined ? " (custom)" : ""}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-neutral-500">Pick at least one account above.</p>
        )}

        {/* per-platform overrides */}
        {selectedPlatforms.length > 1 || Object.keys(overrides).length > 0 ? (
          <div className="mt-4 flex flex-col gap-3">
            {selectedPlatforms.map((platform) => {
              const enabled = overrides[platform] !== undefined;
              return (
                <div key={platform}>
                  <button
                    type="button"
                    onClick={() =>
                      setOverrides((prev) => {
                        const next = { ...prev };
                        if (enabled) delete next[platform];
                        else next[platform] = caption;
                        return next;
                      })
                    }
                    className="text-xs text-neutral-400 underline-offset-2 hover:text-neutral-200 hover:underline"
                  >
                    {enabled ? `Use the shared caption for ${labels[platform]}` : `Customize for ${labels[platform]}`}
                  </button>
                  {enabled ? (
                    <textarea
                      value={overrides[platform] ?? ""}
                      onChange={(e) =>
                        setOverrides((prev) => ({ ...prev, [platform]: e.target.value }))
                      }
                      rows={3}
                      aria-label={`Caption for ${labels[platform]}`}
                      className="mt-1 w-full rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-50 outline-none transition focus:border-neutral-500"
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}
      </section>

      {/* media */}
      <section className="rounded-lg border border-neutral-900 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-medium text-neutral-300">Media</h2>
          <div className="flex items-center gap-3">
            {uploadsEnabled ? (
              <label className="cursor-pointer text-xs font-medium text-neutral-100 underline-offset-2 hover:underline">
                + Upload a file
                <input
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime"
                  className="sr-only"
                  onChange={(event) => {
                    const files = Array.from(event.target.files ?? []);
                    files.forEach(uploadFile);
                    // Reset so choosing the same file twice still fires.
                    event.target.value = "";
                  }}
                />
              </label>
            ) : null}
            <button
              type="button"
              onClick={addMedia}
              className="text-xs text-neutral-400 underline-offset-2 hover:text-neutral-200 hover:underline"
            >
              + Paste a link
            </button>
          </div>
        </div>
        <p className="mt-1 text-xs text-neutral-500">
          {uploadsEnabled
            ? "JPEG, PNG, or WebP up to 8MB; MP4 or MOV up to 300MB. Instagram needs at least one item — it has no text-only posts."
            : "File upload is not switched on yet — paste a public https link to a JPEG, PNG, or MP4. Instagram needs at least one; the platforms fetch it from that link."}
        </p>
        {media.length > 0 ? (
          <ul className="mt-3 flex flex-col gap-2">
            {media.map((row, index) => {
              const isUpload = row.progress !== undefined || Boolean(row.name);
              return (
                <li key={row.key} className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    {isUpload ? (
                      <span className="min-w-0 flex-1 truncate rounded-md border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-sm text-neutral-300">
                        {row.name ?? "Uploaded file"}
                        {row.progress !== undefined ? (
                          <span className="ml-2 text-xs text-neutral-500">
                            {row.progress}%
                          </span>
                        ) : row.url ? (
                          <span className="ml-2 text-xs text-emerald-400">ready</span>
                        ) : null}
                      </span>
                    ) : (
                      <input
                        type="url"
                        value={row.url}
                        placeholder="https://…"
                        aria-label={`Media ${index + 1} URL`}
                        onChange={(e) => updateMedia(row.key, { url: e.target.value })}
                        onBlur={(e) =>
                          updateMedia(row.key, {
                            type: VIDEO_EXTENSIONS.test(e.target.value) ? "video" : row.type,
                          })
                        }
                        className="min-w-0 flex-1 rounded-md border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-sm text-neutral-50 outline-none focus:border-neutral-500"
                      />
                    )}
                    <select
                      value={row.type}
                      aria-label={`Media ${index + 1} type`}
                      disabled={isUpload}
                      onChange={(e) =>
                        updateMedia(row.key, { type: e.target.value as MediaRef["type"] })
                      }
                      className="rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-200 disabled:opacity-50"
                    >
                      <option value="image">Image</option>
                      <option value="video">Video</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => removeMedia(row.key)}
                      aria-label={`Remove media ${index + 1}`}
                      className="rounded-md border border-neutral-800 px-2 py-1.5 text-sm text-neutral-400 hover:border-neutral-600"
                    >
                      ✕
                    </button>
                  </div>
                  {row.progress !== undefined ? (
                    <div
                      className="h-1 w-full overflow-hidden rounded-full bg-neutral-800"
                      role="progressbar"
                      aria-valuenow={row.progress}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`Uploading ${row.name ?? "file"}`}
                    >
                      <div
                        className="h-full bg-emerald-500 transition-all"
                        style={{ width: `${row.progress}%` }}
                      />
                    </div>
                  ) : null}
                  {row.error ? (
                    <p className="text-xs text-red-400">{row.error}</p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}
      </section>

      {/* when */}
      <section className="rounded-lg border border-neutral-900 p-4">
        <h2 className="text-sm font-medium text-neutral-300">When</h2>
        <div className="mt-2 flex flex-wrap items-center gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="mode"
              checked={mode === "now"}
              onChange={() => setMode("now")}
              className="accent-emerald-500"
            />
            Publish now
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="mode"
              checked={mode === "schedule"}
              onChange={() => {
                setMode("schedule");
                const now = new Date();
                setMinSchedule(toLocalInputValue(now));
                if (!scheduledFor) {
                  setScheduledFor(toLocalInputValue(new Date(now.getTime() + 60 * 60 * 1000)));
                }
              }}
              className="accent-emerald-500"
            />
            Schedule
          </label>
          {mode === "schedule" ? (
            <input
              type="datetime-local"
              value={scheduledFor}
              min={minSchedule}
              onChange={(e) => setScheduledFor(e.target.value)}
              aria-label="Scheduled time"
              className="rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-50 [color-scheme:dark]"
            />
          ) : null}
        </div>
        <p className="mt-2 text-xs text-neutral-500">
          Posts today: {usage.postsToday}
          {usage.postsPerDay === null ? "" : ` / ${usage.postsPerDay}`}
          {selectedPlatforms.includes("x")
            ? ` · X this month: ${usage.xPostsThisMonth} / ${usage.xPostsPerMonth}`
            : ""}
        </p>
      </section>

      {/* issues */}
      {issues.length > 0 && selected.length > 0 ? (
        <ul
          aria-live="polite"
          className="flex flex-col gap-1 rounded-md border border-amber-900/60 bg-amber-950/30 px-3 py-2 text-sm text-amber-200"
        >
          {issues.map((issue, i) => (
            <li key={i}>
              {issue.platform ? <span className="font-medium">{labels[issue.platform]}: </span> : null}
              {issue.message}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          className="rounded-md bg-neutral-50 px-4 py-2 text-sm font-semibold text-neutral-950 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Working…" : mode === "now" ? "Publish now" : "Schedule"}
        </button>
        {selected.length === 0 ? (
          <span className="text-xs text-neutral-500">Choose at least one account.</span>
        ) : null}
      </div>

      {/* outcome */}
      {outcome ? <OutcomePanel outcome={outcome} labels={labels} /> : null}
    </div>
  );
}

function OutcomePanel({
  outcome,
  labels,
}: {
  outcome: Outcome;
  labels: Record<Platform, string>;
}) {
  if (outcome.kind === "scheduled") {
    return (
      <p
        aria-live="polite"
        className="rounded-md border border-emerald-900 bg-emerald-950/50 px-3 py-2 text-sm text-emerald-300"
      >
        Scheduled for {new Date(outcome.scheduledFor).toLocaleString()}.{" "}
        <a href="/dashboard/posts" className="underline">
          See it in Posts
        </a>
        .
      </p>
    );
  }

  if (outcome.kind === "error") {
    return (
      <div
        aria-live="polite"
        className="rounded-md border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-300"
      >
        <p>{outcome.message}</p>
        {outcome.details.length > 0 ? (
          <ul className="mt-1 list-disc pl-5">
            {outcome.details.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
        ) : null}
      </div>
    );
  }

  const heading =
    outcome.status === "published"
      ? "Published everywhere."
      : outcome.status === "partial"
        ? "Published to some accounts — not all."
        : "Nothing was published.";

  return (
    <div
      aria-live="polite"
      className={`rounded-md border px-3 py-2 text-sm ${
        outcome.status === "published"
          ? "border-emerald-900 bg-emerald-950/50 text-emerald-200"
          : outcome.status === "partial"
            ? "border-amber-900 bg-amber-950/40 text-amber-200"
            : "border-red-900 bg-red-950/50 text-red-200"
      }`}
    >
      <p className="font-medium">{heading}</p>
      <ul className="mt-2 flex flex-col gap-1">
        {outcome.results.map((r) => (
          <li key={r.connectionId}>
            <span className="font-medium">
              {r.platform ? labels[r.platform] : "Unknown"}
              {r.accountName ? ` · ${r.accountName}` : ""}
            </span>
            {": "}
            {r.outcome === "published" ? (
              r.postUrl ? (
                <a href={r.postUrl} target="_blank" rel="noreferrer" className="underline">
                  published
                </a>
              ) : (
                "published"
              )
            ) : (
              <span>failed — {r.error}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
