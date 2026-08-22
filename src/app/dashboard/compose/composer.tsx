"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";

import {
  Button,
  Card,
  Eyebrow,
  FoxMark,
  segmentedItem,
  segmentedTrack,
} from "@/components/ui";

import {
  parseTikTokOptions,
  validateTikTokOptions,
  type TikTokCreatorContext,
  type TikTokPublishOptions,
} from "@/lib/platforms/tiktok-options";
import { validatePublishOptions } from "@/lib/platforms/publish-options";
import type { OptionSpecs } from "@/lib/publish/specs";
import type {
  MediaRef,
  Platform,
  PlatformPublishOptions,
} from "@/lib/platforms/types";
import { containsExternalLink } from "@/lib/publish/links";
import type { ContentSpecs } from "@/lib/publish/specs";
import type { TargetOutcome } from "@/lib/publish/types";
import { captionLength, validateContent } from "@/lib/publish/validate";

import { PlatformOptionsPanel } from "./platform-options-panel";
import { PostPreview } from "./post-preview";
import { TikTokOptionsPanel, type ContextState } from "./tiktok-options-panel";

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
  /** Each platform's own publishing settings, declared in publish-options.ts. */
  optionSpecs: OptionSpecs;
  labels: Record<Platform, string>;
  /** Platforms with no connected account here, so the grid can still show them
   *  with a way in rather than hiding what the product supports. */
  connectable: { platform: Platform; label: string; reason?: string }[];
  /** Reopened draft, when the composer was entered from /dashboard/drafts. */
  draft?: {
    id: string;
    caption: string;
    media: MediaRef[];
    targetConnectionIds: string[];
    platformOverrides: Record<
      string,
      { caption?: string; options?: PlatformPublishOptions }
    >;
    scheduledFor: string | null;
  };
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
  | {
      kind: "published";
      status: "published" | "partial" | "failed";
      results: TargetOutcome[];
    }
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
  optionSpecs,
  labels,
  connectable,
  draft,
  gates,
  planId,
  xLinksAllowed,
  uploadsEnabled,
  usage,
}: Props) {
  const router = useRouter();
  const [caption, setCaption] = useState(draft?.caption ?? "");
  const [media, setMedia] = useState<MediaRow[]>(
    (draft?.media ?? []).map((item, index) => ({
      key: -1 - index,
      url: item.url,
      type: item.type,
    })),
  );
  const [selected, setSelected] = useState<string[]>(
    draft?.targetConnectionIds ?? [],
  );
  const [overrides, setOverrides] = useState<Partial<Record<Platform, string>>>(
    () => {
      const out: Partial<Record<Platform, string>> = {};
      for (const [platform, value] of Object.entries(
        draft?.platformOverrides ?? {},
      )) {
        if (value.caption !== undefined)
          out[platform as Platform] = value.caption;
      }
      return out;
    },
  );
  // Per-platform publishing settings, keyed by platform. TikTok keeps its own
  // state below because its options depend on live creator_info.
  const [platformOptions, setPlatformOptions] = useState<
    Partial<Record<Platform, PlatformPublishOptions>>
  >(() => {
    const out: Partial<Record<Platform, PlatformPublishOptions>> = {};
    for (const [platform, value] of Object.entries(
      draft?.platformOverrides ?? {},
    )) {
      if (platform !== "tiktok" && value.options) {
        out[platform as Platform] = value.options;
      }
    }
    return out;
  });
  const [savingDraft, setSavingDraft] = useState(false);
  // Per-platform publish options (today: TikTok's privacy level and toggles).
  const [tiktokOptions, setTiktokOptions] = useState<TikTokPublishOptions>({});
  // Live creator context per TikTok connection, fetched once it is selected.
  const [contexts, setContexts] = useState<Record<string, ContextState>>({});
  const [mode, setMode] = useState<"now" | "schedule">(
    draft?.scheduledFor ? "schedule" : "now",
  );
  const [scheduledFor, setScheduledFor] = useState(
    draft?.scheduledFor ? toLocalInputValue(new Date(draft.scheduledFor)) : "",
  );
  // The picker's lower bound. Set from event handlers, never during render —
  // the clock is impure and React wants render idempotent.
  const [minSchedule, setMinSchedule] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  // A ref, not state, because keys are allocated inside an event handler that
  // can run several times before React re-renders. Reading a state value there
  // gave every file in a multi-file selection the SAME key, so each upload's
  // progress patch hit all of them and the last one to finish overwrote every
  // row's URL — pick three images for a carousel, publish three copies of one.
  // Media loaded from a draft uses negative keys, so 1 upwards stays clear.
  const nextKey = useRef(1);
  const takeKey = () => nextKey.current++;

  const accountById = useMemo(
    () => new Map(accounts.map((a) => [a.id, a])),
    [accounts],
  );
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
    () =>
      media
        .filter((m) => m.url.trim())
        .map((m) => ({ url: m.url.trim(), type: m.type })),
    [media],
  );
  const uploading = media.some((m) => m.progress !== undefined);

  const captionFor = (platform: Platform) => overrides[platform] ?? caption;

  const selectedTikTok = useMemo(
    () =>
      selected
        .map((id) => accountById.get(id))
        .filter((a): a is ComposerAccount =>
          Boolean(a && a.platform === "tiktok"),
        ),
    [selected, accountById],
  );
  const hasVideo = mediaRefs.some((m) => m.type === "video");

  // TikTok requires creator_info BEFORE the post form is usable: it is where
  // the allowed privacy levels and disabled interactions come from. Fetched
  // from the click that selects the account (never from an effect), once per
  // connection; the panel renders from whatever state each one is in.
  const ensureContext = (account: ComposerAccount) => {
    if (account.platform !== "tiktok" || contexts[account.id]) return;
    setContexts((prev) => ({ ...prev, [account.id]: { status: "loading" } }));
    void (async () => {
      try {
        const response = await fetch(
          `/api/connections/${account.id}/publish-context`,
        );
        const body = (await response.json().catch(() => ({}))) as {
          context?: TikTokCreatorContext | null;
          message?: string;
        };
        if (!response.ok || !body.context) {
          setContexts((prev) => ({
            ...prev,
            [account.id]: {
              status: "error",
              message:
                body.message ??
                "Could not load this account's TikTok settings.",
            },
          }));
          return;
        }
        setContexts((prev) => ({
          ...prev,
          [account.id]: {
            status: "ready",
            context: body.context as TikTokCreatorContext,
          },
        }));
      } catch {
        setContexts((prev) => ({
          ...prev,
          [account.id]: {
            status: "error",
            message: "Could not reach the server.",
          },
        }));
      }
    })();
  };

  // ── live validation ────────────────────────────────────────────────────
  const issues: Issue[] = useMemo(() => {
    const out: Issue[] = [];
    const captionOf = (platform: Platform) => overrides[platform] ?? caption;
    for (const platform of selectedPlatforms) {
      const spec = specs[platform];
      if (!spec) continue;
      for (const issue of validateContent(spec, {
        caption: captionOf(platform),
        media: mediaRefs,
      })) {
        out.push({ platform, message: issue.message });
      }
      if (
        platform === "x" &&
        !xLinksAllowed &&
        containsExternalLink(captionOf(platform))
      ) {
        out.push({
          platform,
          message:
            "Posts to X cannot contain links — X charges 13x more for them, so no plan allows it.",
        });
      }
      // The platform's own publishing settings, checked with the same pure
      // function the API runs. Without this the composer was more permissive
      // than the API — a `<` in a YouTube title showed no error here and came
      // back as a 422 after submit, which is the failure this file's own
      // contract says must not happen.
      for (const message of validatePublishOptions(
        platform,
        platformOptions[platform],
      )) {
        out.push({ platform, message });
      }

      if (platform === "tiktok") {
        const states = selectedTikTok.map((a) => contexts[a.id]);
        if (states.some((s) => !s || s.status === "loading")) {
          out.push({ platform, message: "Loading TikTok account details…" });
        }
        for (const state of states) {
          if (state?.status === "error")
            out.push({ platform, message: state.message });
        }
        const ready = states.filter(
          (s): s is Extract<ContextState, { status: "ready" }> =>
            s?.status === "ready",
        );
        // Validate against every selected creator: one set of options must
        // satisfy all of them.
        const seen = new Set<string>();
        const targets = ready.length > 0 ? ready.map((s) => s.context) : [null];
        for (const context of targets) {
          for (const message of validateTikTokOptions(
            parseTikTokOptions(tiktokOptions),
            context,
            {
              hasVideo,
            },
          )) {
            if (seen.has(message)) continue;
            seen.add(message);
            out.push({ platform, message });
          }
        }
      }
    }
    if (mode === "now") {
      if (usage.postsPerDay !== null && usage.postsToday >= usage.postsPerDay) {
        out.push({
          platform: null,
          message: `You have used today's ${usage.postsPerDay} posts on the ${planId} plan. Schedule it for later, or upgrade.`,
        });
      }
      if (
        selectedPlatforms.includes("x") &&
        usage.xPostsThisMonth >= usage.xPostsPerMonth
      ) {
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
  }, [
    selectedPlatforms,
    specs,
    caption,
    overrides,
    mediaRefs,
    media,
    uploading,
    mode,
    scheduledFor,
    xLinksAllowed,
    usage,
    planId,
    selectedTikTok,
    contexts,
    tiktokOptions,
    platformOptions,
    hasVideo,
  ]);

  const canSubmit = selected.length > 0 && issues.length === 0 && !submitting;

  // ── handlers ───────────────────────────────────────────────────────────
  const toggleAccount = (id: string) => {
    const account = accountById.get(id);
    if (account && !selected.includes(id)) ensureContext(account);
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const addMedia = () => {
    setMedia((prev) => [...prev, { key: takeKey(), url: "", type: "image" }]);
  };
  const updateMedia = (key: number, patch: Partial<MediaRow>) =>
    setMedia((prev) =>
      prev.map((m) => (m.key === key ? { ...m, ...patch } : m)),
    );
  const removeMedia = (key: number) =>
    setMedia((prev) => prev.filter((m) => m.key !== key));

  // Upload straight to R2 with a URL the server signs. The bytes never pass
  // through our box — see /api/media/upload-url. XMLHttpRequest rather than
  // fetch purely because it reports progress, which matters for a 200MB video.
  const uploadFile = (file: File) => {
    const rowKey = takeKey();
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
        const body = (await response.json().catch(() => ({}))) as Record<
          string,
          unknown
        >;
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
          xhr.onerror = () =>
            reject(new Error("Upload failed — check your connection."));
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

  /** Caption overrides plus each platform's own settings, in the shape the API
   *  stores on the row. */
  const buildOverrides = () => {
    const platformOverrides: Record<
      string,
      { caption?: string; options?: PlatformPublishOptions }
    > = {};
    for (const platform of selectedPlatforms) {
      const override = overrides[platform];
      if (override !== undefined) {
        platformOverrides[platform] = { caption: override };
      }
      const options = platformOptions[platform];
      if (options && Object.keys(options).length > 0) {
        platformOverrides[platform] = {
          ...(platformOverrides[platform] ?? {}),
          options,
        };
      }
    }
    if (selectedPlatforms.includes("tiktok")) {
      const options: PlatformPublishOptions = {};
      for (const [key, value] of Object.entries(
        parseTikTokOptions(tiktokOptions),
      )) {
        if (value !== undefined) options[key] = value;
      }
      platformOverrides.tiktok = {
        ...(platformOverrides.tiktok ?? {}),
        options,
      };
    }
    return platformOverrides;
  };

  /**
   * Park it without publishing.
   *
   * Saved through the same endpoint with `draft: true` so it goes through the
   * same parsing — but deliberately NOT through the same validation gate: half
   * a post is exactly what a draft is, and refusing to save one because the
   * caption is too long for X is how people lose work.
   */
  const saveDraft = async () => {
    setSavingDraft(true);
    setOutcome(null);
    try {
      const response = await fetch("/api/posts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          draft: true,
          draftId: draft?.id,
          caption,
          media: mediaRefs,
          targetConnectionIds: selected,
          platformOverrides: buildOverrides(),
          scheduledFor:
            mode === "schedule" && scheduledFor
              ? new Date(scheduledFor).toISOString()
              : null,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      if (!response.ok) {
        setOutcome({
          kind: "error",
          message: "The draft was not saved.",
          details: [
            String((body.message as string) ?? `HTTP ${response.status}`),
          ],
        });
        return;
      }
      router.push("/dashboard/drafts?saved=1");
    } catch (error) {
      setOutcome({
        kind: "error",
        message: "Could not reach the server.",
        details: [error instanceof Error ? error.message : String(error)],
      });
    } finally {
      setSavingDraft(false);
    }
  };

  const submit = async () => {
    if (!canSubmit) return;
    if (mode === "schedule" && new Date(scheduledFor).getTime() <= Date.now()) {
      setOutcome({
        kind: "error",
        message: "That time has already passed. Pick a later one.",
        details: [],
      });
      return;
    }
    setSubmitting(true);
    setOutcome(null);
    try {
      const platformOverrides = buildOverrides();
      const response = await fetch("/api/posts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          caption,
          media: mediaRefs,
          targetConnectionIds: selected,
          platformOverrides,
          draftId: draft?.id,
          scheduledFor:
            mode === "schedule" ? new Date(scheduledFor).toISOString() : null,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;

      if (response.status === 201) {
        const post = body.post as { id: string; scheduledFor: string };
        setOutcome({
          kind: "scheduled",
          id: post.id,
          scheduledFor: post.scheduledFor,
        });
        return;
      }
      if (response.ok) {
        const post = body.post as {
          id: string;
          status: "published" | "partial" | "failed";
        };
        setOutcome({
          kind: "published",
          status: post.status,
          results: (body.results as TargetOutcome[]) ?? [],
        });
        return;
      }
      const details = Array.isArray(body.issues)
        ? (body.issues as Record<string, unknown>[]).map((i) =>
            String(i.message ?? i.code ?? ""),
          )
        : [];
      setOutcome({
        kind: "error",
        message:
          response.status === 409
            ? ((body.message as string) ??
              "That draft is no longer a draft. Nothing was sent twice.")
            : response.status === 401
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
    <div className="grid items-start gap-4 shell:grid-cols-[1.6fr_1fr]">
      <div className="flex min-w-0 flex-col gap-3.5">
      {/* accounts */}
      <Card>
        <Eyebrow>Post to</Eyebrow>
        <ul className="mt-3 flex flex-wrap gap-2">
          {grouped.flatMap(([platform, list]) => {
            const gate = gates[platform];
            return list.map((account) => {
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
                    title={disabledReason ?? gate?.message}
                    className={`flex cursor-pointer items-center gap-2 rounded-full border px-3.5 py-2 text-[13px] font-medium transition ${
                      checked
                        ? "border-accent bg-accent-soft text-ink"
                        : "border-line text-muted hover:border-line-strong"
                    } ${disabledReason ? "cursor-not-allowed opacity-50" : ""}`}
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={checked}
                      disabled={Boolean(disabledReason)}
                      onChange={() => toggleAccount(account.id)}
                    />
                    <span
                      aria-hidden
                      className={`h-[7px] w-[7px] rounded-full ${checked ? "bg-accent" : "bg-faint"}`}
                    />
                    <span>
                      {labels[platform]} · {account.name}
                    </span>
                    {gate ? (
                      <span className="text-[10px]" title={gate.message}>
                        💎
                      </span>
                    ) : null}
                    {account.status !== "active" ? (
                      <span className="text-[11px] text-danger">reconnect</span>
                    ) : null}
                  </label>
                </li>
              );
            });
          })}
        </ul>

        {connectable.length > 0 ? (
          <div className="mt-3.5 border-t border-line pt-3">
            <p className="text-[11.5px] text-faint">Not connected here yet</p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {/* Shown, never hidden, and never a dead label: a person deciding
                  whether this tool does what they need should see the whole
                  list, and every entry goes somewhere that explains itself —
                  including the ones this deployment has no keys for yet. */}
              {connectable.map((item) => (
                <li key={item.platform}>
                  <a
                    href={`/api/connect/${item.platform}/start`}
                    title={item.reason}
                    className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-line-strong px-3.5 py-2 text-[13px] text-muted transition hover:border-accent hover:text-accent"
                  >
                    <span className="text-faint">+</span>
                    {item.label}
                    {item.reason ? (
                      <span className="text-[10px] text-sky">setup</span>
                    ) : null}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Card>

      {/* caption */}
      <Card>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <label htmlFor="caption">
            <Eyebrow>Caption</Eyebrow>
          </label>
          {selectedPlatforms.length > 0 ? (
            <ul className="flex flex-wrap gap-3 text-[11.5px]">
              {selectedPlatforms.map((platform) => {
                const spec = specs[platform];
                if (!spec) return null;
                const length = captionLength(captionFor(platform));
                const over = length > spec.rules.captionMaxChars;
                return (
                  <li
                    key={platform}
                    className={over ? "text-danger" : "text-faint"}
                  >
                    {labels[platform]} {length.toLocaleString()}/
                    {spec.rules.captionMaxChars.toLocaleString()}
                    {overrides[platform] !== undefined ? " (custom)" : ""}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-[11.5px] text-faint">
              Pick at least one account above.
            </p>
          )}
        </div>
        <textarea
          id="caption"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          rows={6}
          placeholder="What do you want to say?"
          className="mt-2.5 w-full resize-y rounded-[10px] border border-line bg-chip px-3.5 py-3 text-sm/[21px] text-ink outline-none transition placeholder:text-faint focus:border-accent"
        />

        {/* per-platform overrides */}
        {selectedPlatforms.length > 1 || Object.keys(overrides).length > 0 ? (
          <div className="mt-3 flex flex-col gap-3">
            <div className="flex flex-wrap gap-4">
              {selectedPlatforms.map((platform) => {
                const enabled = overrides[platform] !== undefined;
                return (
                  <button
                    key={platform}
                    type="button"
                    onClick={() =>
                      setOverrides((prev) => {
                        const next = { ...prev };
                        if (enabled) delete next[platform];
                        else next[platform] = caption;
                        return next;
                      })
                    }
                    className="text-xs font-medium text-accent transition hover:brightness-[1.08]"
                  >
                    {enabled
                      ? `Use the shared caption for ${labels[platform]}`
                      : `Customize for ${labels[platform]}`}
                  </button>
                );
              })}
            </div>
            {selectedPlatforms.map((platform) =>
              overrides[platform] !== undefined ? (
                <textarea
                  key={platform}
                  value={overrides[platform] ?? ""}
                  onChange={(e) =>
                    setOverrides((prev) => ({
                      ...prev,
                      [platform]: e.target.value,
                    }))
                  }
                  rows={3}
                  aria-label={`Caption for ${labels[platform]}`}
                  className="w-full resize-y rounded-[10px] border border-line bg-chip px-3.5 py-2.5 text-[13.5px] text-ink outline-none transition focus:border-accent"
                />
              ) : null,
            )}
          </div>
        ) : null}
      </Card>

      {/* per-platform options */}
      {selectedPlatforms.map((platform) => {
        const spec = optionSpecs[platform];
        if (!spec) return null;
        return (
          <PlatformOptionsPanel
            key={platform}
            platform={platform}
            spec={spec}
            values={platformOptions[platform] ?? {}}
            hasVideo={hasVideo}
            onChange={(next) =>
              setPlatformOptions((current) => ({
                ...current,
                [platform]: next,
              }))
            }
          />
        );
      })}

      {selectedTikTok.length > 0 ? (
        <TikTokOptionsPanel
          accounts={selectedTikTok.map((a) => ({ id: a.id, name: a.name }))}
          contexts={contexts}
          options={tiktokOptions}
          onChange={setTiktokOptions}
          hasVideo={hasVideo}
        />
      ) : null}

      {/* media */}
      <Card>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <Eyebrow>Media</Eyebrow>
          <div className="flex items-center gap-3">
            {uploadsEnabled ? (
              <label className="cursor-pointer text-xs font-semibold text-accent transition hover:brightness-[1.08]">
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
              className="text-xs font-medium text-muted transition hover:text-ink"
            >
              + Paste a link
            </button>
          </div>
        </div>
        <p className="mt-1.5 text-[11.5px]/[17px] text-faint">
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
                    <span
                      aria-hidden
                      className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg bg-chip text-sm text-faint"
                    >
                      {row.type === "video" ? "▶" : "◲"}
                    </span>
                    {isUpload ? (
                      <span className="min-w-0 flex-1 truncate rounded-[10px] border border-line bg-chip px-3 py-2 text-[13px] text-muted">
                        {row.name ?? "Uploaded file"}
                        {row.progress !== undefined ? (
                          <span className="ml-2 text-[11.5px] text-faint">
                            {row.progress}%
                          </span>
                        ) : row.url ? (
                          <span className="ml-2 text-[11.5px] text-ok">
                            ready
                          </span>
                        ) : null}
                      </span>
                    ) : (
                      <input
                        type="url"
                        value={row.url}
                        placeholder="https://…"
                        aria-label={`Media ${index + 1} URL`}
                        onChange={(e) =>
                          updateMedia(row.key, { url: e.target.value })
                        }
                        onBlur={(e) =>
                          updateMedia(row.key, {
                            type: VIDEO_EXTENSIONS.test(e.target.value)
                              ? "video"
                              : row.type,
                          })
                        }
                        className="min-w-0 flex-1 rounded-[10px] border border-line bg-chip px-3 py-2 text-[13px] text-ink outline-none transition placeholder:text-faint focus:border-accent"
                      />
                    )}
                    <select
                      value={row.type}
                      aria-label={`Media ${index + 1} type`}
                      disabled={isUpload}
                      onChange={(e) =>
                        updateMedia(row.key, {
                          type: e.target.value as MediaRef["type"],
                        })
                      }
                      className="rounded-[10px] border border-line bg-chip px-2 py-2 text-[13px] text-ink disabled:opacity-50"
                    >
                      <option value="image">Image</option>
                      <option value="video">Video</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => removeMedia(row.key)}
                      aria-label={`Remove media ${index + 1}`}
                      className="px-1.5 py-1.5 text-[13px] text-faint transition hover:text-danger"
                    >
                      ✕
                    </button>
                  </div>
                  {row.progress !== undefined ? (
                    <div
                      className="h-1 w-full overflow-hidden rounded-full bg-chip"
                      role="progressbar"
                      aria-valuenow={row.progress}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`Uploading ${row.name ?? "file"}`}
                    >
                      <div
                        className="h-full bg-ok transition-all"
                        style={{ width: `${row.progress}%` }}
                      />
                    </div>
                  ) : null}
                  {row.error ? (
                    <p className="text-[11.5px] text-danger">{row.error}</p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}
      </Card>

      {/* when */}
      <Card>
        <Eyebrow>When</Eyebrow>
        <div className="mt-2.5 flex flex-wrap items-center gap-3">
          <div className={segmentedTrack}>
            <button
              type="button"
              onClick={() => setMode("now")}
              aria-pressed={mode === "now"}
              className={segmentedItem(mode === "now")}
            >
              Publish now
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("schedule");
                const now = new Date();
                setMinSchedule(toLocalInputValue(now));
                if (!scheduledFor) {
                  setScheduledFor(
                    toLocalInputValue(new Date(now.getTime() + 60 * 60 * 1000)),
                  );
                }
              }}
              aria-pressed={mode === "schedule"}
              className={segmentedItem(mode === "schedule")}
            >
              Schedule
            </button>
          </div>
          {mode === "schedule" ? (
            <input
              type="datetime-local"
              value={scheduledFor}
              min={minSchedule}
              onChange={(e) => setScheduledFor(e.target.value)}
              aria-label="Scheduled time"
              className="rounded-[10px] border border-line bg-chip px-3 py-2 text-[13px] text-ink outline-none focus:border-accent"
            />
          ) : null}
        </div>
        {mode === "schedule" ? (
          <p className="mt-2.5 text-[11.5px]/[17px] text-faint">
            🦊 It publishes on the server — no tab open, no reminder needed.
          </p>
        ) : null}
        <p className="mt-2 text-[11.5px] text-faint">
          Posts today: {usage.postsToday}
          {usage.postsPerDay === null ? "" : ` / ${usage.postsPerDay}`}
          {selectedPlatforms.includes("x")
            ? ` · X this month: ${usage.xPostsThisMonth} / ${usage.xPostsPerMonth}`
            : ""}
        </p>
      </Card>

      {/* issues */}
      {issues.length > 0 && selected.length > 0 ? (
        <div
          aria-live="polite"
          className="rounded-xl border border-warn bg-warn-soft px-3.5 py-3"
        >
          <p className="text-xs font-semibold text-warn">
            Fix before publishing
          </p>
          <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-4 text-[13px]/[19px] text-ink">
            {issues.map((issue, i) => (
              <li key={i}>
                {issue.platform ? (
                  <span className="font-semibold">
                    {labels[issue.platform]}:{" "}
                  </span>
                ) : null}
                {issue.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex items-center gap-3">
        <Button
          type="button"
          tone="primary"
          onClick={submit}
          disabled={!canSubmit}
        >
          {submitting
            ? "Working…"
            : mode === "now"
              ? "Publish now"
              : "Schedule post"}
        </Button>
        <Button
          type="button"
          onClick={saveDraft}
          disabled={savingDraft || submitting}
        >
          {savingDraft ? "Saving…" : "Save draft"}
        </Button>
        {selected.length === 0 ? (
          <span className="text-[11.5px] text-faint">
            Choose at least one account.
          </span>
        ) : null}
      </div>

      {/* outcome */}
      {outcome ? <OutcomePanel outcome={outcome} labels={labels} /> : null}
      </div>

      {/* The preview is the aside on a wide screen and nothing at all on a
          phone: a second rendering of the post below the composer costs more
          scrolling than it explains. */}
      {selectedPlatforms.length > 0 ? (
        <aside className="hidden shell:sticky shell:top-8 shell:block">
          <PostPreview
            platforms={selectedPlatforms}
            labels={labels}
            caption={caption}
            overrides={overrides}
            media={mediaRefs}
            scheduledFor={mode === "schedule" ? scheduledFor : null}
            accountsByPlatform={Object.fromEntries(
              selectedPlatforms.map((platform) => [
                platform,
                selected
                  .map((id) => accountById.get(id))
                  .filter((account) => account?.platform === platform)
                  .map((account) => account!.name),
              ]),
            )}
          />
        </aside>
      ) : null}
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
      <div
        aria-live="polite"
        className="flex items-center gap-3 rounded-xl border border-ok bg-ok-soft px-3.5 py-3 text-[13px] text-ink"
      >
        <FoxMark className="h-6" />
        <p>
          Scheduled — the fox will take it from here.{" "}
          {new Date(outcome.scheduledFor).toLocaleString()}.{" "}
          <a href="/dashboard/calendar" className="text-accent underline">
            See it in Posts
          </a>
          .
        </p>
      </div>
    );
  }

  if (outcome.kind === "error") {
    return (
      <div
        aria-live="polite"
        className="rounded-xl border border-danger bg-danger-soft px-3.5 py-3 text-[13px] text-danger"
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
      ? "Published everywhere. Sly work."
      : outcome.status === "partial"
        ? "Published to some accounts — not all."
        : "Nothing was published.";

  return (
    <div
      aria-live="polite"
      className={`rounded-xl border px-3.5 py-3 text-[13px] text-ink ${
        outcome.status === "published"
          ? "border-ok bg-ok-soft"
          : outcome.status === "partial"
            ? "border-warn bg-warn-soft"
            : "border-danger bg-danger-soft"
      }`}
    >
      <p className="flex items-center gap-2.5 font-semibold">
        <FoxMark className="h-5" />
        {heading}
      </p>
      <ul className="mt-2 flex flex-col gap-1 text-[12.5px]">
        {outcome.results.map((r) => (
          <li key={r.connectionId}>
            <span className="font-medium">
              {r.platform ? labels[r.platform] : "Unknown"}
              {r.accountName ? ` · ${r.accountName}` : ""}
            </span>
            {": "}
            {r.outcome === "published" ? (
              r.postUrl ? (
                <a
                  href={r.postUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  published
                </a>
              ) : (
                "published"
              )
            ) : (
              <span>failed — {r.error}</span>
            )}
            {r.outcome === "published" && r.platform === "tiktok" ? (
              // TikTok's guidelines: tell the user the post is processing and
              // may take a moment to show on their profile.
              <span className="text-xs opacity-80">
                {" "}
                — TikTok is processing it; it may take a few minutes to appear
                on the profile.
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
