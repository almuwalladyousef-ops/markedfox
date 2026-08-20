"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { saveRuleAction, type RuleFormState } from "@/lib/dm/actions";
import type { BuilderAccount } from "@/lib/dm/builder-accounts";
import type { DmRule, DmTriggerType } from "@/lib/dm/types";
import type { RecentPost } from "@/lib/platforms/types";

// The rule builder. Built for someone who has never seen it: one question
// per section, plain words, sensible defaults, and the server's validation
// messages shown beside the field they are about. A real <form> posting to a
// server action, so nothing here is the gate — RLS and validateRuleForm are.

type Props = {
  accounts: BuilderAccount[];
  rule?: DmRule;
};

const INITIAL: RuleFormState = {};

type FollowUp = { key: number; text: string; delayMinutes: number };

const DELAY_CHOICES: { label: string; minutes: number }[] = [
  { label: "10 minutes", minutes: 10 },
  { label: "1 hour", minutes: 60 },
  { label: "6 hours", minutes: 360 },
  { label: "1 day", minutes: 1440 },
  { label: "3 days", minutes: 4320 },
];

export function RuleBuilder({ accounts, rule }: Props) {
  const [state, formAction, pending] = useActionState(saveRuleAction, INITIAL);
  const errors = state.errors ?? {};

  const firstStep = rule?.actions.find((a) => a.type === "private_reply" || a.type === "message");
  const firstButton = firstStep?.buttons?.[0];
  const publicReply = rule?.actions.find((a) => a.type === "comment_reply");
  // Follow-ups are the delayed message steps; the first DM has no delay.
  const existingFollowUps: FollowUp[] = (rule?.actions ?? [])
    .flatMap((a) => (a.type === "message" && a.delay_seconds ? [a] : []))
    .map((a, i) => ({ key: i, text: a.text, delayMinutes: Math.round((a.delay_seconds ?? 0) / 60) }));

  const [connectionId, setConnectionId] = useState(rule?.connection_id ?? accounts.find((a) => a.ready)?.id ?? "");
  const [trigger, setTrigger] = useState<DmTriggerType>(rule?.trigger_type ?? "comment");
  const [keywordMode, setKeywordMode] = useState<"any" | "keywords">(rule && rule.keywords.length === 0 && rule.trigger_type !== "dm_keyword" ? "any" : "keywords");
  const [postScope, setPostScope] = useState<"any" | "specific">(rule && rule.target_post_ids.length > 0 ? "specific" : "any");
  const [selectedPosts, setSelectedPosts] = useState<string[]>(rule?.target_post_ids ?? []);
  const [posts, setPosts] = useState<RecentPost[] | null>(null);
  const [postsError, setPostsError] = useState<string | null>(null);
  const [followUps, setFollowUps] = useState<FollowUp[]>(existingFollowUps);
  const [nextKey, setNextKey] = useState(existingFollowUps.length);
  const [showLink, setShowLink] = useState(Boolean(firstButton));

  const loadPosts = async (forConnection: string) => {
    setPosts(null);
    setPostsError(null);
    try {
      const response = await fetch(`/api/connections/${forConnection}/recent-posts`);
      const body = (await response.json().catch(() => ({}))) as { posts?: RecentPost[]; message?: string };
      if (!response.ok) {
        setPostsError(body.message ?? "Could not load recent posts.");
        setPosts([]);
        return;
      }
      setPosts(body.posts ?? []);
    } catch {
      setPostsError("Could not reach the server.");
      setPosts([]);
    }
  };

  const chooseSpecific = () => {
    setPostScope("specific");
    if (posts === null && connectionId) void loadPosts(connectionId);
  };

  const input =
    "mt-1 w-full rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-50 outline-none transition focus:border-neutral-500";
  const label = "text-sm font-medium text-neutral-300";
  const help = "mt-1 text-xs text-neutral-500";
  const err = (key: string) => (errors[key] ? <p className="mt-1 text-xs text-red-400">{errors[key]}</p> : null);

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {rule ? <input type="hidden" name="rule_id" value={rule.id} /> : null}
      {state.message ? (
        <p aria-live="polite" className="rounded-md border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-300">
          {state.message}
        </p>
      ) : null}

      {/* name + account */}
      <section className="rounded-lg border border-neutral-900 p-4">
        <label htmlFor="name" className={label}>
          Name this rule
        </label>
        <input id="name" name="name" defaultValue={rule?.name ?? ""} placeholder="Send the guide" className={input} />
        {err("name")}

        <label htmlFor="connection_id" className={`${label} mt-4 block`}>
          Which account
        </label>
        <select
          id="connection_id"
          name="connection_id"
          value={connectionId}
          onChange={(e) => {
            setConnectionId(e.target.value);
            setSelectedPosts([]);
            setPosts(null);
          }}
          className={input}
        >
          <option value="">Choose an account…</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id} disabled={!a.ready}>
              {a.name} · {a.platformLabel}
              {a.ready ? "" : " — turn on automation first"}
            </option>
          ))}
        </select>
        {err("connection_id")}
      </section>

      {/* trigger */}
      <section className="rounded-lg border border-neutral-900 p-4">
        <p className={label}>When this happens</p>
        <div className="mt-2 flex flex-col gap-2 text-sm text-neutral-200">
          {(
            [
              ["comment", "Someone comments on a post"],
              ["dm_keyword", "Someone sends a DM"],
              ["story_reply", "Someone replies to a story"],
            ] as [DmTriggerType, string][]
          ).map(([value, text]) => (
            <label key={value} className="flex items-center gap-2">
              <input type="radio" name="trigger" value={value} checked={trigger === value} onChange={() => setTrigger(value)} className="accent-emerald-500" />
              {text}
            </label>
          ))}
        </div>

        {trigger === "comment" ? (
          <div className="mt-4">
            <p className={label}>On which posts</p>
            <div className="mt-2 flex flex-wrap gap-4 text-sm text-neutral-200">
              <label className="flex items-center gap-2">
                <input type="radio" name="post_scope" value="any" checked={postScope === "any"} onChange={() => setPostScope("any")} className="accent-emerald-500" />
                Any post
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="post_scope" value="specific" checked={postScope === "specific"} onChange={chooseSpecific} className="accent-emerald-500" />
                Specific posts
              </label>
            </div>
            {postScope === "specific" ? (
              <div className="mt-3">
                {selectedPosts.map((id) => (
                  <input key={id} type="hidden" name="post_ids" value={id} />
                ))}
                {posts === null && !postsError ? (
                  <p className={help}>Loading recent posts…</p>
                ) : postsError ? (
                  <p className="mt-1 text-xs text-red-400">{postsError}</p>
                ) : posts && posts.length === 0 ? (
                  <p className={help}>No recent posts found on this account.</p>
                ) : (
                  <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {(posts ?? []).map((post) => {
                      const on = selectedPosts.includes(post.id);
                      return (
                        <li key={post.id}>
                          <button
                            type="button"
                            onClick={() =>
                              setSelectedPosts((prev) => (on ? prev.filter((p) => p !== post.id) : [...prev, post.id]))
                            }
                            aria-pressed={on}
                            className={`block w-full overflow-hidden rounded-md border text-left transition ${on ? "border-emerald-500" : "border-neutral-800 hover:border-neutral-600"}`}
                          >
                            {post.thumbnailUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element -- Instagram CDN thumbnails
                              <img src={post.thumbnailUrl} alt="" className="aspect-square w-full object-cover" />
                            ) : (
                              <span className="block aspect-square w-full bg-neutral-900" />
                            )}
                            <span className="block truncate px-2 py-1 text-[11px] text-neutral-400">
                              {post.caption?.slice(0, 40) || post.mediaType || post.id}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {err("post_ids")}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="mt-4">
          <p className={label}>{trigger === "comment" ? "Which comments" : trigger === "dm_keyword" ? "Which messages" : "Which replies"}</p>
          <div className="mt-2 flex flex-wrap gap-4 text-sm text-neutral-200">
            {trigger !== "dm_keyword" ? (
              <label className="flex items-center gap-2">
                <input type="radio" name="keyword_mode" value="any" checked={keywordMode === "any"} onChange={() => setKeywordMode("any")} className="accent-emerald-500" />
                {trigger === "comment" ? "Any comment" : "Any reply"}
              </label>
            ) : (
              <input type="hidden" name="keyword_mode" value="keywords" />
            )}
            <label className="flex items-center gap-2">
              <input type="radio" name="keyword_mode" value="keywords" checked={keywordMode === "keywords"} onChange={() => setKeywordMode("keywords")} className="accent-emerald-500" />
              Containing a keyword
            </label>
          </div>
          {keywordMode === "keywords" ? (
            <div className="mt-2">
              <input
                name="keywords"
                defaultValue={rule?.keywords.join(", ") ?? ""}
                placeholder="LINK, guide, send it"
                aria-label="Keywords, separated by commas"
                className={input}
              />
              <p className={help}>Separate keywords with commas. Matching ignores capitals.</p>
              <label className="mt-2 flex items-center gap-2 text-xs text-neutral-400">
                <input type="checkbox" name="keyword_match" value="exact" defaultChecked={rule?.config.keyword_match === "exact"} className="accent-emerald-500" />
                Only when the whole comment is exactly one of these words
              </label>
              {err("keywords")}
            </div>
          ) : null}
        </div>
      </section>

      {/* actions */}
      <section className="rounded-lg border border-neutral-900 p-4">
        <label htmlFor="dm_text" className={label}>
          Send this DM
        </label>
        <textarea
          id="dm_text"
          name="dm_text"
          rows={4}
          defaultValue={firstStep?.text ?? ""}
          placeholder="Hey! Here's the guide you asked for 👇"
          className={input}
        />
        <p className={help}>Up to 1,000 characters. Sent privately to the person.</p>
        {err("dm_text")}

        {showLink ? (
          <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_2fr]">
            <div>
              <label htmlFor="button_title" className="text-xs text-neutral-400">
                Link label
              </label>
              <input id="button_title" name="button_title" defaultValue={firstButton?.title ?? ""} placeholder="Get the guide" maxLength={20} className={input} />
              {err("button_title")}
            </div>
            <div>
              <label htmlFor="button_url" className="text-xs text-neutral-400">
                Link
              </label>
              <input id="button_url" name="button_url" type="url" defaultValue={firstButton?.url ?? ""} placeholder="https://…" className={input} />
              {err("button_url")}
            </div>
            <p className="text-xs text-neutral-500 sm:col-span-2">Clicks on this link are counted on the rule.</p>
          </div>
        ) : (
          <button type="button" onClick={() => setShowLink(true)} className="mt-3 text-xs text-neutral-300 underline-offset-2 hover:underline">
            + Add a link
          </button>
        )}

        {trigger === "comment" ? (
          <div className="mt-5">
            <label htmlFor="comment_reply_text" className={label}>
              Also reply publicly to the comment <span className="font-normal text-neutral-500">(optional)</span>
            </label>
            <input
              id="comment_reply_text"
              name="comment_reply_text"
              defaultValue={publicReply?.text ?? ""}
              placeholder="Sent you a DM! 📩"
              className={input}
            />
            <p className={help}>Everyone sees this under the comment — it shows others the rule works.</p>
          </div>
        ) : null}

        <div className="mt-5">
          <p className={label}>
            Follow-ups <span className="font-normal text-neutral-500">(optional)</span>
          </p>
          <p className={help}>
            Extra DMs sent later. Instagram only allows them within 24 hours of the person&apos;s last message to you — a follow-up
            outside that window is skipped, not sent.
          </p>
          <ul className="mt-2 flex flex-col gap-3">
            {followUps.map((f, index) => (
              <li key={f.key} className="rounded-md border border-neutral-900 p-3">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-xs text-neutral-400">
                    Wait{" "}
                    <select
                      name={`followup_delay_${index}`}
                      value={f.delayMinutes}
                      onChange={(e) => setFollowUps((prev) => prev.map((x) => (x.key === f.key ? { ...x, delayMinutes: Number(e.target.value) } : x)))}
                      className="rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs text-neutral-50"
                    >
                      {DELAY_CHOICES.map((d) => (
                        <option key={d.minutes} value={d.minutes}>
                          {d.label}
                        </option>
                      ))}
                      {!DELAY_CHOICES.some((d) => d.minutes === f.delayMinutes) ? (
                        <option value={f.delayMinutes}>{f.delayMinutes} minutes</option>
                      ) : null}
                    </select>{" "}
                    then send
                  </label>
                  <button type="button" onClick={() => setFollowUps((prev) => prev.filter((x) => x.key !== f.key))} className="text-xs text-neutral-500 hover:text-red-300">
                    Remove
                  </button>
                </div>
                <textarea
                  name={`followup_text_${index}`}
                  rows={2}
                  value={f.text}
                  onChange={(e) => setFollowUps((prev) => prev.map((x) => (x.key === f.key ? { ...x, text: e.target.value } : x)))}
                  placeholder="Did the link work for you?"
                  className={input}
                />
                {err(`followup_delay_${index}`)}
              </li>
            ))}
          </ul>
          {followUps.length < 5 ? (
            <button
              type="button"
              onClick={() => {
                setFollowUps((prev) => [...prev, { key: nextKey, text: "", delayMinutes: 60 }]);
                setNextKey((k) => k + 1);
              }}
              className="mt-2 text-xs text-neutral-300 underline-offset-2 hover:underline"
            >
              + Add a follow-up
            </button>
          ) : null}
        </div>
      </section>

      {/* advanced */}
      <section className="rounded-lg border border-neutral-900 p-4">
        <label className="flex items-start gap-2 text-sm text-neutral-200">
          <input
            type="checkbox"
            name="once_per_contact"
            value="on"
            defaultChecked={rule ? (rule.config.once_per_contact ?? rule.trigger_type === "comment") : true}
            className="mt-0.5 accent-emerald-500"
          />
          <span>
            Answer each person only once
            <span className="block text-xs text-neutral-500">Off means the same person gets the DM again every time they trigger the rule.</span>
          </span>
        </label>
      </section>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-neutral-50 px-4 py-2 text-sm font-semibold text-neutral-950 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Saving…" : rule ? "Save changes" : "Turn it on"}
        </button>
        <Link href="/dashboard/automations" className="text-sm text-neutral-400 hover:text-neutral-200">
          Cancel
        </Link>
      </div>
    </form>
  );
}
