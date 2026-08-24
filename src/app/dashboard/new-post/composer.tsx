"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { Icon, PlanDiamond, type IconName } from "@/components/icons";
import { PlatformIcon, PlatformTile } from "@/components/platform-icon";
import {
  Button,
  Card,
  Eyebrow,
  FoxMark,
  Notice,
  SectionHeading,
  buttonClass,
  cx,
  iconButtonClass,
  inputClass,
  segmentedItem,
  segmentedTrack,
} from "@/components/ui";

import {
  parseTikTokOptions,
  validateTikTokOptions,
  type TikTokCreatorContext,
  type TikTokPublishOptions,
} from "@/lib/platforms/tiktok-options";
import { checkUpload } from "@/lib/media/policy";
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
  /** Empty until the bytes are actually in R2. A row picked from the computer
   *  gets one only when the post is committed. */
  url: string;
  type: MediaRef["type"];
  /** Set while bytes are in flight, 0–100. Only ever during a commit. */
  progress?: number;
  /** Upload failure, shown on the row itself. */
  error?: string;
  /** Filename, so an uploaded row reads as the file rather than a long URL. */
  name?: string;
  /** The chosen bytes, held in the tab until Publish, Schedule or Save draft.
   *  Present and `url` empty means "not uploaded yet". */
  file?: File;
  /** A `blob:` URL for the preview frame, so the post can be looked at without
   *  a byte leaving the machine. Revoked when the row goes. */
  previewUrl?: string;
};

/**
 * The stand-in URL a picked-but-not-yet-uploaded file wears during validation.
 *
 * `validateContent` is the same function the API runs, and it requires an
 * absolute http(s) URL. A pending file does not have one yet — but the checks
 * that matter in the composer are the counts, the types and the mixing rules,
 * and those all run off `type`. So a pending row stands in with a URL shaped
 * like the one it will be given.
 *
 * It never leaves the browser: `commitMedia` replaces every pending row with
 * the real URL its upload returns, and `assertNoPending` refuses to send if
 * one somehow survives.
 */
const PENDING_MEDIA_URL = "https://upload.pending.markedfox.com/";

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

/**
 * Five steps rather than one long form.
 *
 * The old composer put the file, the caption, the platform grid and every
 * platform's own settings in one scrolling column, with the publish button
 * underneath all of it. The settings alone run to a screenful for YouTube, so
 * that was a publish button nobody had read by the time they reached it — and
 * the two decisions that change everything downstream (what kind of post, and
 * which accounts) were buried in the middle of it.
 *
 * A text post skips step 2, because there is no file to pick.
 */
const STEPS = [
  { id: "kind", short: "Kind", title: "What are you posting?" },
  { id: "file", short: "File", title: "Add your file" },
  { id: "caption", short: "Caption", title: "Caption and platforms" },
  { id: "settings", short: "Settings", title: "Per-platform settings" },
  { id: "review", short: "Review", title: "Preview and publish" },
] as const;

type Step = (typeof STEPS)[number]["id"];

type PostKind = "video" | "photo" | "text";

const KINDS: { id: PostKind; label: string; note: string; icon: IconName }[] = [
  {
    id: "video",
    label: "Short video",
    note: "A reel on Instagram, a short on YouTube, a video on TikTok.",
    icon: "play",
  },
  {
    id: "photo",
    label: "Photo or carousel",
    note: "One image, or several in the order you add them.",
    icon: "image",
  },
  {
    id: "text",
    label: "Text only",
    note: "Words with no media — a post on X, Threads or Facebook.",
    icon: "drafts",
  },
];

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
  // A new post starts with every account it could go to already on. Posting
  // everywhere at once is the product, so that is the default, and turning one
  // off is the deliberate act rather than turning six on.
  //
  // Only accounts that could actually publish: a dead token or a platform the
  // plan does not include would otherwise start selected and immediately
  // block the composer with an issue nobody asked for. A reopened draft keeps
  // whatever it was saved with, including nothing.
  const [selected, setSelected] = useState<string[]>(() => {
    if (draft) return draft.targetConnectionIds;
    return accounts
      .filter(
        (account) =>
          account.status === "active" &&
          account.publishable &&
          !gates[account.platform],
      )
      .map((account) => account.id);
  });
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
  // A reopened draft already has its answers, so it starts on the caption
  // rather than asking somebody to re-declare what they are posting.
  const [kind, setKind] = useState<PostKind | null>(() => {
    if (!draft) return null;
    if (draft.media.some((item) => item.type === "video")) return "video";
    if (draft.media.length > 0) return "photo";
    return draft.caption ? "text" : null;
  });
  const [step, setStep] = useState<Step>(draft ? "caption" : "kind");
  // Whether the caption is written once or once per platform. Derived from a
  // reopened draft, so a draft with overrides comes back with the box ticked.
  const [perPlatform, setPerPlatform] = useState(
    () =>
      Object.values(draft?.platformOverrides ?? {}).some(
        (value) => value.caption !== undefined,
      ),
  );
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

  // A picked file counts as media from the moment it is picked, even though
  // its bytes are still on the machine — it is exactly as much "a video going
  // to Instagram" as an uploaded one, and every rule the composer checks runs
  // off the type rather than the URL.
  const mediaRefs: MediaRef[] = useMemo(
    () =>
      media
        .filter((m) => m.file || m.url.trim())
        .map((m) => ({
          url: m.url.trim() || PENDING_MEDIA_URL,
          type: m.type,
        })),
    [media],
  );
  /** Bytes are in flight. Only true during a commit now, never while editing. */
  const uploading = media.some((m) => m.progress !== undefined);
  /** Files chosen but not yet in storage — what a commit has to upload, and
   *  what would be lost by closing the tab. */
  const pendingCount = media.filter((m) => m.file && !m.url.trim()).length;

  // Deferring the upload means a picked file lives in this tab and nowhere
  // else until the post is committed, so closing it loses the bytes. The old
  // flow never needed this warning, because it uploaded on pick.
  useEffect(() => {
    if (pendingCount === 0) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [pendingCount]);

  // Every `blob:` URL handed out is held by the document until it is revoked.
  // Through a ref, because the cleanup has to run on unmount with the final
  // list and must not re-run every time that list changes.
  const mediaSnapshot = useRef(media);
  mediaSnapshot.current = media;
  useEffect(
    () => () => {
      for (const row of mediaSnapshot.current) {
        if (row.previewUrl) URL.revokeObjectURL(row.previewUrl);
      }
    },
    [],
  );

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
    setMedia((prev) => {
      const row = prev.find((m) => m.key === key);
      if (row?.previewUrl) URL.revokeObjectURL(row.previewUrl);
      return prev.filter((m) => m.key !== key);
    });

  /**
   * Take a file, do not upload it.
   *
   * The bytes stay in the tab until the post is committed — see `commitMedia`.
   * The point is that the whole post can be built and looked at before
   * anything is sent: pick the file, write the caption, choose the accounts,
   * set each platform's options, read the review, and only then does anything
   * leave the machine. It also means a post abandoned halfway uploads nothing
   * at all, where the old flow left an orphan in R2 for the sweep to collect.
   *
   * The size and type check is the same pure function the signing route runs,
   * so a file that would be refused is refused here, instantly and for free,
   * rather than at the one moment the person least wants to hear it.
   */
  const addFiles = (files: File[]) => {
    setMedia((prev) => [
      ...prev,
      ...files.map((file) => {
        const check = checkUpload(file.type, file.size);
        return {
          key: takeKey(),
          url: "",
          type: (check.ok ? check.kind : file.type.startsWith("video/")
            ? "video"
            : "image") as MediaRef["type"],
          name: file.name,
          // A refused file is kept as a row carrying its reason rather than
          // dropped silently — otherwise picking a 40MB PNG looks like the
          // button did nothing.
          ...(check.ok
            ? { file, previewUrl: URL.createObjectURL(file) }
            : { error: check.reason }),
        };
      }),
    ]);
  };

  /** PUT one file to R2 with a URL the server signs, reporting progress into
   *  its row. The bytes never pass through our box — see
   *  /api/media/upload-url. XMLHttpRequest rather than fetch purely because it
   *  reports progress, which matters for a 300MB video. */
  const uploadOne = async (row: MediaRow, file: File): Promise<MediaRef> => {
    updateMedia(row.key, { progress: 0, error: undefined });

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
      throw new Error(String(body.message ?? "That file was refused."));
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
        updateMedia(row.key, {
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

    // The URL goes back on the row, so a publish that fails downstream — a
    // dead token, a platform refusing the caption — can be retried without
    // sending the same 300MB again.
    updateMedia(row.key, {
      url: publicUrl,
      type: kind,
      progress: undefined,
      error: undefined,
    });
    return { url: publicUrl, type: kind };
  };

  /**
   * Upload everything still on the machine and hand back the refs to post.
   *
   * Sequential on purpose: several files at once share one uplink, so the
   * progress bars all crawl together and none of them means anything. One at
   * a time, "2 of 3" is the truth.
   *
   * Throws on the first failure, and the caller posts nothing — a partial
   * upload must never become a post missing half its carousel.
   */
  const commitMedia = async (): Promise<MediaRef[]> => {
    const refs: MediaRef[] = [];
    for (const row of media) {
      const existing = row.url.trim();
      if (existing) {
        refs.push({ url: existing, type: row.type });
        continue;
      }
      if (!row.file) continue;
      refs.push(await uploadOne(row, row.file));
    }
    return refs;
  };

  /** Last line of defence: the stand-in URL is for validation only and must
   *  never reach the API, which would store it and try to publish it. */
  const assertNoPending = (refs: MediaRef[]) => {
    if (refs.some((ref) => ref.url === PENDING_MEDIA_URL)) {
      throw new Error("A file did not finish uploading.");
    }
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
      // A draft has to carry its files, or reopening it tomorrow finds a post
      // whose video only ever existed in a tab that has since been closed.
      let refs: MediaRef[];
      try {
        refs = await commitMedia();
        assertNoPending(refs);
      } catch (error) {
        setOutcome({
          kind: "error",
          message: "The files were not uploaded, so the draft was not saved.",
          details: [error instanceof Error ? error.message : String(error)],
        });
        return;
      }
      const response = await fetch("/api/posts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          draft: true,
          draftId: draft?.id,
          caption,
          media: refs,
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
      // The upload happens here, at the moment the person commits — not when
      // they picked the file. Nothing has left the machine until now.
      //
      // For a scheduled post this is still the right moment: the tick that
      // fires it runs on the server with no browser open, so the bytes have to
      // be in storage before the row is written, not at the scheduled minute.
      let refs: MediaRef[];
      try {
        refs = await commitMedia();
        assertNoPending(refs);
      } catch (error) {
        setOutcome({
          kind: "error",
          message:
            mode === "now"
              ? "The files were not uploaded, so nothing was posted."
              : "The files were not uploaded, so nothing was scheduled.",
          details: [error instanceof Error ? error.message : String(error)],
        });
        return;
      }

      const platformOverrides = buildOverrides();
      const response = await fetch("/api/posts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          caption,
          media: refs,
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

  const selectedAccounts = selected
    .map((id) => accountById.get(id))
    .filter((account): account is ComposerAccount => Boolean(account));
  // The preview reads the local `blob:` URL when there is one, so a file
  // shows itself the instant it is picked and without a round trip. A row from
  // a reopened draft has only its stored URL, and uses that.
  const previewRow =
    media.find((m) => m.previewUrl || m.url.trim()) ?? null;
  const preview = previewRow
    ? {
        url: previewRow.previewUrl ?? previewRow.url.trim(),
        type: previewRow.type,
      }
    : null;
  const blocked = issues.length > 0 || selected.length === 0;

  // What the action bar says while a commit is uploading. The media list lives
  // on the file step and Publish is pressed on the review step, so without
  // this the bar reads "Working…" for however long a 300MB video takes and
  // gives no sign anything is happening.
  const uploadNote = (() => {
    if (!uploading) return null;
    const files = media.filter((m) => m.file);
    const active = files.find((m) => m.progress !== undefined);
    if (!active) return null;
    const position = files.filter((m) => m.url.trim()).length + 1;
    const which =
      files.length > 1 ? `file ${position} of ${files.length}` : active.name;
    return `Uploading ${which} — ${active.progress ?? 0}%`;
  })();

  // What this post will be called where it lands. A video going to Instagram
  // is a reel and to YouTube a short; the same post made of photos is neither,
  // so the word changes with the media rather than being decoration.
  const destination = (platform: Platform): string => {
    if (hasVideo) {
      if (platform === "instagram") return "Reel";
      if (platform === "youtube") return "Short";
      if (platform === "tiktok") return "TikTok";
    }
    if (platform === "threads") return "Thread";
    return labels[platform];
  };

  const togglePlatform = (platform: Platform, list: ComposerAccount[]) => {
    const usable = list.filter(
      (account) => account.status === "active" && account.publishable,
    );
    const anyOn = usable.some((account) => selected.includes(account.id));
    if (anyOn) {
      setSelected((prev) => prev.filter((id) => !usable.some((a) => a.id === id)));
      return;
    }
    for (const account of usable) ensureContext(account);
    setSelected((prev) => [
      ...prev,
      ...usable.filter((account) => !prev.includes(account.id)).map((a) => a.id),
    ]);
  };

  // Which steps this post actually has. A text-only post has no file to pick,
  // and a step that exists only to be skipped past is a step that makes the
  // flow feel longer than it is.
  const steps = STEPS.filter((item) => item.id !== "file" || kind !== "text");
  const stepIndex = Math.max(0, steps.findIndex((item) => item.id === step));
  const isLast = stepIndex === steps.length - 1;
  const goTo = (id: Step) => {
    setStep(id);
    setOutcome(null);
  };
  const back = () => {
    if (stepIndex > 0) goTo(steps[stepIndex - 1].id);
    else router.back();
  };
  const forward = () => {
    if (!isLast) goTo(steps[stepIndex + 1].id);
  };

  // What stops the person moving on, said as one sentence rather than as a
  // disabled button with no explanation. null means nothing is in the way.
  const holdup: string | null =
    step === "kind"
      ? kind === null
        ? "Pick what you are posting."
        : null
      : step === "file"
        ? mediaRefs.length === 0
          ? "Add a file, or go back and choose a text post."
          : null
        : step === "caption"
          ? selected.length === 0
            ? "Pick at least one account."
            : issues.length > 0
              ? "Fix the problems listed below first."
              : null
          : step === "settings"
            ? blocked
              ? "Fix the problems listed below first."
              : null
            : null;

  // The media frame, shown on every step that has a post to look at.
  const mediaFrame = (
    <div className="wide:sticky wide:top-8">
      <div className="relative overflow-hidden rounded-2xl border border-line bg-chip">
        <div className="aspect-[9/16] w-full">
          {preview ? (
            preview.type === "video" ? (
              <video
                src={preview.url}
                className="h-full w-full object-cover"
                controls
                playsInline
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview.url} alt="" className="h-full w-full object-cover" />
            )
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2.5 px-6 text-center">
              <FoxMark className="h-7 opacity-70" />
              <p className="text-[13px] text-pretty text-faint">
                {kind === "text"
                  ? "A text post has no media. It previews on the last step."
                  : uploadsEnabled
                    ? "Add a video or an image and it previews here."
                    : "Paste a public link to a video or image and it previews here."}
              </p>
            </div>
          )}
        </div>

        {media.length > 1 ? (
          <span className="absolute top-2.5 right-2.5 rounded-full bg-black/55 px-2.5 py-1 text-[11.5px] font-bold text-white">
            1 / {media.length}
          </span>
        ) : null}
      </div>
    </div>
  );

  // The media list under the frame: filenames, upload progress, and the URL
  // rows for a deployment with no object storage.
  const mediaList =
    media.length > 0 ? (
      <ul className="mt-4 flex flex-col gap-2.5">
        {media.map((row, index) => {
          const isUpload = row.progress !== undefined || Boolean(row.name);
          return (
            <li key={row.key} className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2.5">
                <span
                  aria-hidden
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-chip text-faint"
                >
                  <Icon
                    name={row.type === "video" ? "play" : "image"}
                    className="h-4 w-4"
                  />
                </span>
                {isUpload ? (
                  <span className="min-w-0 flex-1 truncate text-[13px] text-muted">
                    {row.name ?? "Uploaded file"}
                    {row.progress !== undefined ? (
                      <span className="ml-2 text-faint">{row.progress}%</span>
                    ) : row.url ? (
                      <span className="ml-2 text-ok">uploaded</span>
                    ) : row.file ? (
                      // Says where the file actually is. "Ready" used to mean
                      // "already in storage"; now it would be a lie.
                      <span className="ml-2 text-faint">on this device</span>
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
                        type: VIDEO_EXTENSIONS.test(e.target.value)
                          ? "video"
                          : row.type,
                      })
                    }
                    className={cx(inputClass, "min-w-0 flex-1 text-[13px]")}
                  />
                )}
                <button
                  type="button"
                  onClick={() => removeMedia(row.key)}
                  aria-label={`Remove media ${index + 1}`}
                  className="p-1.5 text-faint transition-[color] duration-150 hover:text-danger"
                >
                  <Icon name="close" className="h-4 w-4" />
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
                    className="h-full bg-ok transition-[width] duration-150"
                    style={{ width: `${row.progress}%` }}
                  />
                </div>
              ) : null}
              {row.error ? (
                <p className="text-[12.5px] text-danger">{row.error}</p>
              ) : null}
            </li>
          );
        })}
      </ul>
    ) : null;

  const filePicker = uploadsEnabled ? (
    <label className={cx(buttonClass("ink", "md"), "cursor-pointer")}>
      <Icon name="plus" className="h-4 w-4" strokeWidth={2.1} />
      Select from computer
      <input
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime"
        className="sr-only"
        onChange={(event) => {
          addFiles(Array.from(event.target.files ?? []));
          // Reset so choosing the same file twice still fires.
          event.target.value = "";
        }}
      />
    </label>
  ) : null;

  const issuePanel =
    issues.length > 0 && selected.length > 0 ? (
      <div
        aria-live="polite"
        className="mt-6 rounded-xl border border-warn bg-warn-soft px-4 py-3.5"
      >
        <p className="text-[13px] font-bold text-warn">Fix before publishing</p>
        <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-4 text-[14px]/[21px] text-ink">
          {issues.map((issue, i) => (
            <li key={i}>
              {issue.platform ? (
                <span className="font-semibold">{labels[issue.platform]}: </span>
              ) : null}
              {issue.message}
            </li>
          ))}
        </ul>
      </div>
    ) : null;

  return (
    <div className="pb-2">
      <div className="mx-auto flex w-full max-w-[1000px] flex-col gap-6">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={back}
            aria-label="Back"
            className={iconButtonClass}
          >
            <Icon name="chevronLeft" className="h-4 w-4" />
          </button>
          <h1 className="font-display text-[30px]/[36px] font-bold tracking-[-0.025em] text-ink">
            {steps[stepIndex]?.title ?? "New post"}
          </h1>

          {/* The step rail. Steps already passed are links back; steps ahead
              are not, because arriving on "per-platform settings" before there
              is a platform selected is a screen with nothing on it. */}
          <ol className="ml-auto flex items-center gap-1.5">
            {steps.map((item, index) => {
              const done = index < stepIndex;
              const here = index === stepIndex;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    disabled={index > stepIndex}
                    onClick={() => goTo(item.id)}
                    title={item.title}
                    className={cx(
                      "flex h-8 items-center gap-2 rounded-full px-3 text-[12.5px] font-bold transition-[background,color] duration-150",
                      here
                        ? "bg-ink text-panel"
                        : done
                          ? "bg-chip text-muted hover:text-ink"
                          : "text-faint",
                    )}
                  >
                    <span
                      aria-hidden
                      className={cx(
                        "flex h-[18px] w-[18px] items-center justify-center rounded-full text-[10.5px]",
                        here ? "bg-white/20" : "bg-line",
                      )}
                    >
                      {index + 1}
                    </span>
                    <span className={here ? "" : "hidden wide:inline"}>
                      {item.short}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>

        {step === "kind" ? (
          /* ── 1. what kind of post ─────────────────────────────────────── */
          <div>
            <p className="max-w-lg text-[15px]/[24px] text-pretty text-muted">
              This decides what MarkedFox calls the post on each platform, and
              which settings it has to ask you about.
            </p>
            <ul className="mt-6 grid gap-3.5 sm:grid-cols-3">
              {KINDS.map((option) => {
                const on = kind === option.id;
                return (
                  <li key={option.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setKind(option.id);
                        // Choosing "text" after uploading a file would silently
                        // publish that file; dropping it here is the honest
                        // reading of the press.
                        if (option.id === "text") setMedia([]);
                        goTo(option.id === "text" ? "caption" : "file");
                      }}
                      aria-pressed={on}
                      className={cx(
                        "flex h-full w-full flex-col items-start gap-2.5 rounded-2xl border-[1.5px] px-6 py-6 text-left transition-[background,border-color] duration-150",
                        on
                          ? "border-accent bg-accent-soft"
                          : "border-line bg-panel hover:border-line-strong",
                      )}
                    >
                      <span
                        className={cx(
                          "flex h-11 w-11 items-center justify-center rounded-[14px]",
                          on ? "bg-accent text-accent-ink" : "bg-chip text-muted",
                        )}
                      >
                        <Icon name={option.icon} className="h-5 w-5" />
                      </span>
                      <span className="font-display text-[16.5px] font-bold text-ink">
                        {option.label}
                      </span>
                      <span className="text-[13.5px]/[20px] text-pretty text-muted">
                        {option.note}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : step === "file" ? (
          /* ── 2. the file ──────────────────────────────────────────────── */
          <div className="grid items-start gap-9 wide:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
            {mediaFrame}
            <div className="min-w-0">
              <SectionHeading>
                {kind === "photo" ? "Add your photos" : "Add your video"}
              </SectionHeading>
              <p className="mt-2 max-w-md text-[15px]/[24px] text-pretty text-muted">
                {kind === "photo"
                  ? "Pick one image, or several for a carousel. They post in the order you add them."
                  : "One file. It stays on your machine while you build the post, and uploads straight to storage when you publish — the bytes never pass through our server."}
              </p>

              <div className="mt-5 flex flex-wrap items-center gap-2.5">
                {filePicker}
                <Button type="button" onClick={addMedia} tone="quiet">
                  Paste a link
                </Button>
              </div>
              <p className="mt-3 text-[13px] text-faint">
                MP4 or MOV up to 300MB · JPEG, PNG or WebP up to 8MB
              </p>

              {mediaList}
            </div>
          </div>
        ) : step === "caption" ? (
          /* ── 3. caption and platforms ─────────────────────────────────── */
          <div className="grid items-start gap-9 wide:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
            {mediaFrame}
            <div className="min-w-0">
              <div className="flex items-center gap-2.5">
                <div className="flex items-center -space-x-2">
                  {selectedAccounts.slice(0, 3).map((account) => (
                    <span
                      key={account.id}
                      title={`${labels[account.platform]} · ${account.name}`}
                      className="inline-flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border-2 border-panel bg-chip"
                    >
                      <PlatformIcon
                        platform={account.platform}
                        className="h-full w-full"
                      />
                    </span>
                  ))}
                </div>
                {selectedAccounts.length > 3 ? (
                  <span className="rounded-full bg-chip px-2.5 py-1 text-[12.5px] font-bold text-muted">
                    +{selectedAccounts.length - 3}
                  </span>
                ) : null}
                {selectedAccounts.length === 0 ? (
                  <span className="text-[13.5px] text-faint">
                    Pick where this goes below.
                  </span>
                ) : null}
              </div>

              <label htmlFor="caption" className="sr-only">
                Caption
              </label>
              <textarea
                id="caption"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                rows={5}
                placeholder="Write a caption…"
                className="mt-3 w-full resize-y border-0 bg-transparent px-0 py-2 text-[17px]/[26px] text-ink outline-none placeholder:text-faint"
              />

              {/* One checkbox instead of a "Customize for X" link per platform.
                  The old row of links grew with the number of platforms, and
                  every one of them said almost the same thing. */}
              {selectedPlatforms.length > 1 ? (
                <label className="flex cursor-pointer items-center gap-2.5 text-[14px] font-semibold text-ink">
                  <input
                    type="checkbox"
                    checked={perPlatform}
                    onChange={(event) => {
                      const on = event.target.checked;
                      setPerPlatform(on);
                      setOverrides(
                        on
                          ? Object.fromEntries(
                              selectedPlatforms.map((platform) => [
                                platform,
                                overrides[platform] ?? caption,
                              ]),
                            )
                          : {},
                      );
                    }}
                    className="h-[17px] w-[17px] accent-[var(--accent)]"
                  />
                  Write a different caption per platform
                </label>
              ) : null}

              {perPlatform && selectedPlatforms.length > 1 ? (
                <ul className="mt-4 flex flex-col gap-3">
                  {selectedPlatforms.map((platform) => {
                    const spec = specs[platform];
                    const value = overrides[platform] ?? caption;
                    const length = captionLength(value);
                    const max = spec?.rules.captionMaxChars ?? Infinity;
                    const over = length > max;
                    return (
                      <li key={platform}>
                        <div
                          className={cx(
                            "rounded-2xl border bg-panel px-5 py-4",
                            over ? "border-danger" : "border-line",
                          )}
                        >
                          <div className="flex items-center gap-2.5">
                            <PlatformTile platform={platform} size={26} />
                            <span className="text-[14px] font-semibold text-ink">
                              {labels[platform]}
                            </span>
                            <span
                              className={cx(
                                "ml-auto text-[12.5px]",
                                over ? "font-bold text-danger" : "text-faint",
                              )}
                            >
                              {length.toLocaleString()}/
                              {Number.isFinite(max) ? max.toLocaleString() : "∞"}
                            </span>
                          </div>
                          <textarea
                            value={value}
                            onChange={(e) =>
                              setOverrides((prev) => ({
                                ...prev,
                                [platform]: e.target.value,
                              }))
                            }
                            rows={3}
                            aria-label={`Caption for ${labels[platform]}`}
                            className="mt-2.5 w-full resize-y border-0 bg-transparent px-0 text-[14.5px]/[22px] text-ink outline-none placeholder:text-faint"
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : selectedPlatforms.length > 0 ? (
                <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-[12.5px]">
                  {selectedPlatforms.map((platform) => {
                    const spec = specs[platform];
                    if (!spec) return null;
                    const length = captionLength(captionFor(platform));
                    const over = length > spec.rules.captionMaxChars;
                    return (
                      <li
                        key={platform}
                        className={over ? "font-bold text-danger" : "text-faint"}
                      >
                        {labels[platform]} {length.toLocaleString()}/
                        {spec.rules.captionMaxChars.toLocaleString()}
                      </li>
                    );
                  })}
                </ul>
              ) : null}

              {/* Tagging is a platform-side feature we do not call yet. Saying
                  so is better than a control that looks live and is not. */}
              <div className="mt-5 flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-panel px-5 py-4">
                <Icon name="people" className="h-[18px] w-[18px] text-muted" />
                <span className="text-[14px] font-semibold text-ink">
                  Tag people
                </span>
                <span className="text-[13px] text-faint">
                  Add @handles to the caption — MarkedFox passes them through as
                  written, and each platform links its own.
                </span>
              </div>

              <div className="mt-7 border-t border-line pt-7">
                <SectionHeading>Choose platforms</SectionHeading>
                <p className="mt-2 max-w-md text-[14px]/[21px] text-pretty text-muted">
                  Select the accounts this goes to. Everything selected here
                  publishes at the same time.
                </p>

                <ul className="mt-5 flex flex-wrap gap-x-6 gap-y-6">
                  {grouped.map(([platform, list]) => {
                    const gate = gates[platform];
                    const usable = list.filter(
                      (account) => account.status === "active" && account.publishable,
                    );
                    const on = usable.some((account) => selected.includes(account.id));
                    const disabledReason = gate
                      ? gate.message
                      : usable.length === 0
                        ? "Reconnect this account in Settings first."
                        : null;
                    return (
                      <li key={platform} className="w-[76px]">
                        <button
                          type="button"
                          onClick={() => {
                            if (disabledReason) return;
                            togglePlatform(platform, list);
                          }}
                          aria-pressed={on}
                          title={
                            disabledReason ??
                            `${labels[platform]} · ${list.map((a) => a.name).join(", ")}`
                          }
                          className={cx(
                            "block w-[76px] transition-transform duration-150",
                            disabledReason
                              ? "cursor-not-allowed opacity-45"
                              : "hover:-translate-y-0.5",
                          )}
                        >
                          <PlatformTile platform={platform} size={64} radius={19} />
                          <span className="mt-2.5 flex items-center justify-center gap-1.5">
                            <span
                              aria-hidden
                              className={cx(
                                "flex h-[16px] w-[16px] items-center justify-center rounded-[5px] transition-[background,border-color] duration-150",
                                on
                                  ? "bg-accent text-accent-ink"
                                  : "border border-line-strong text-transparent",
                              )}
                            >
                              <Icon name="check" className="h-2.5 w-2.5" strokeWidth={3} />
                            </span>
                            <span
                              className={cx(
                                "text-[12.5px] font-bold",
                                on ? "text-ink" : "text-faint",
                              )}
                            >
                              {destination(platform)}
                            </span>
                          </span>
                          {gate ? (
                            <span
                              className="mt-1 flex justify-center"
                              title={gate.message}
                            >
                              <PlanDiamond className="h-2.5 w-2.5" />
                            </span>
                          ) : null}
                        </button>

                        {/* Two accounts on one platform is a real case — a
                            personal and a brand Instagram — so the tile
                            toggles both and these pick between them. */}
                        {list.length > 1 ? (
                          <ul className="mt-2 flex flex-col items-center gap-1">
                            {list.map((account) => (
                              <li key={account.id}>
                                <label
                                  className={cx(
                                    "flex cursor-pointer items-center gap-1.5 text-[11.5px]",
                                    selected.includes(account.id)
                                      ? "text-ink"
                                      : "text-faint",
                                  )}
                                  title={account.name}
                                >
                                  <input
                                    type="checkbox"
                                    className="sr-only"
                                    checked={selected.includes(account.id)}
                                    disabled={Boolean(disabledReason)}
                                    onChange={() => toggleAccount(account.id)}
                                  />
                                  <span aria-hidden>
                                    {selected.includes(account.id) ? "●" : "○"}
                                  </span>
                                  <span className="max-w-[64px] truncate">
                                    {account.name}
                                  </span>
                                </label>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </li>
                    );
                  })}

                  {/* Never hidden and never a dead label: a platform with no
                      account here still shows, and the + goes somewhere that
                      explains itself. */}
                  {connectable.map((item) => (
                    <li key={item.platform} className="w-[76px]">
                      <a
                        href={`/api/connect/${item.platform}/start`}
                        title={item.reason ?? `Connect ${item.label}`}
                        className="block w-[76px] transition-transform duration-150 hover:-translate-y-0.5"
                      >
                        <PlatformTile
                          platform={item.platform}
                          size={64}
                          radius={19}
                          className="opacity-45"
                        />
                        <span className="mt-2.5 flex items-center justify-center gap-1.5">
                          <span
                            aria-hidden
                            className="flex h-[16px] w-[16px] items-center justify-center rounded-full bg-chip text-muted"
                          >
                            <Icon name="plus" className="h-2.5 w-2.5" strokeWidth={3} />
                          </span>
                          <span className="text-[12.5px] font-bold text-faint">
                            {item.label}
                          </span>
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>

              {issuePanel}
            </div>
          </div>
        ) : step === "settings" ? (
          /* ── 4. what each platform asks for ───────────────────────────── */
          <div className="grid items-start gap-9 wide:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
            {mediaFrame}
            <div className="min-w-0">
              <SectionHeading>Settings for each platform</SectionHeading>
              <p className="mt-2 max-w-md text-[14px]/[21px] text-pretty text-muted">
                Only what the platform&apos;s own API accepts appears here. A toggle
                that looks right and does nothing is worse than no toggle.
              </p>

              <div className="mt-5">
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
                      variant="split"
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
                  <div className="border-t border-line py-7">
                    <TikTokOptionsPanel
                      accounts={selectedTikTok.map((a) => ({ id: a.id, name: a.name }))}
                      contexts={contexts}
                      options={tiktokOptions}
                      onChange={setTiktokOptions}
                      hasVideo={hasVideo}
                    />
                  </div>
                ) : null}

                {/* A platform's section can be absent for two different
                    reasons — it declares nothing, or what it declares is
                    video-only and this is a photo — and both leave the step
                    blank. An empty step with no explanation reads as a page
                    that failed to load. */}
                {selectedPlatforms.every((platform) => {
                  const spec = optionSpecs[platform];
                  return !spec || (spec.videoOnly && !hasVideo);
                }) && selectedTikTok.length === 0 ? (
                  <Notice>
                    Nothing to set. None of the platforms you picked take extra
                    settings for this kind of post.
                  </Notice>
                ) : null}
              </div>

              {issuePanel}
            </div>
          </div>
        ) : (
          /* ── 5. preview and publish ───────────────────────────────────── */
          <div className="grid items-start gap-9 wide:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
            {mediaFrame}
            <div className="flex min-w-0 flex-col gap-5">
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

              <Card>
                <Eyebrow>When</Eyebrow>
                <div className="mt-3 flex flex-wrap items-center gap-3">
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
                      className={cx(inputClass, "w-auto")}
                    />
                  ) : null}
                </div>
                {mode === "schedule" ? (
                  <p className="mt-3 text-[13px]/[19px] text-faint">
                    It publishes on the server — no tab open, no reminder needed.
                  </p>
                ) : null}
                <p className="mt-2.5 text-[13px] text-faint">
                  Posts today: {usage.postsToday}
                  {usage.postsPerDay === null ? "" : ` / ${usage.postsPerDay}`}
                  {selectedPlatforms.includes("x")
                    ? ` · X this month: ${usage.xPostsThisMonth} / ${usage.xPostsPerMonth}`
                    : ""}
                </p>
              </Card>

              {outcome ? <OutcomePanel outcome={outcome} labels={labels} /> : null}

              {issuePanel}
            </div>
          </div>
        )}
      </div>

      {/* ── the bar that follows you down the page ──────────────────────── */}
      {/* Sticky inside the column rather than fixed to the viewport: the
          sidebar changes width when it collapses, and a bar pinned to the
          window would have to guess which width it is. */}
      {/* Held clear of the mobile tab bar, which is fixed to the viewport
          bottom: at `bottom-0` this bar sat underneath it and the primary
          action was unreachable on a phone. */}
      <div className="sticky bottom-[calc(70px+env(safe-area-inset-bottom))] z-40 -mx-[18px] mt-8 border-t border-line bg-panel/95 px-[18px] py-3.5 backdrop-blur shell:bottom-0 shell:-mx-12 shell:px-12">
        <div className="mx-auto flex max-w-[1000px] flex-col items-center gap-1.5">
          <div className="flex items-center gap-3">
            <Button
              type="button"
              tone="quiet"
              onClick={saveDraft}
              disabled={savingDraft || submitting}
            >
              {savingDraft ? "Saving…" : "Save draft"}
            </Button>
            {isLast ? (
              <Button
                type="button"
                tone="primary"
                onClick={submit}
                disabled={!canSubmit}
              >
                {submitting
                  ? uploading
                    ? "Uploading…"
                    : "Working…"
                  : mode === "now"
                    ? "Publish now"
                    : "Schedule post"}
              </Button>
            ) : (
              <Button
                type="button"
                tone="primary"
                onClick={forward}
                disabled={holdup !== null}
              >
                Next
              </Button>
            )}
          </div>
          <p
            aria-live="polite"
            className={cx(
              "text-[13px]",
              uploadNote ? "font-semibold text-ink" : "text-faint",
            )}
          >
            {uploadNote ??
              (isLast
                ? pendingCount > 0
                  ? mode === "now"
                    ? `Your ${pendingCount === 1 ? "file uploads" : "files upload"} and the post goes out when you press publish.`
                    : `Your ${pendingCount === 1 ? "file uploads" : "files upload"} when you schedule it, so it can go out without this tab open.`
                  : "Nothing is sent until you press publish."
                : (holdup ??
                  `Next: ${steps[stepIndex + 1]?.title.toLowerCase()}.`))}
          </p>
        </div>
      </div>
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
