"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { Card, Pill } from "@/components/ui";
import { saveRuleAction, type RuleFormState } from "@/lib/dm/actions";
import type { BuilderAccount } from "@/lib/dm/builder-accounts";
import type { RuleTemplate } from "@/lib/dm/templates";
import type { DmRule, DmTriggerType } from "@/lib/dm/types";
import type { RecentPost } from "@/lib/platforms/types";

import { PhonePreview, type PreviewMessage } from "./phone-preview";

// The rule builder, written as a sentence.
//
// Every section is a clause — "When someone comments on… / And the comment
// contains… / They get… / And then they get…" — because the person building
// this is a creator, not an engineer, and "a private_reply step with one
// button" is not a sentence anybody thinks in.
//
// Beside it, what actually arrives on somebody's phone. That preview is the
// single most useful thing here: it turns "I think this is right" into "yes,
// that", and it is why the message fields are controlled state rather than
// uncontrolled inputs.
//
// A real <form> posting to a server action, so nothing here is the gate — RLS
// and validateRuleForm are.

type Props = {
  accounts: BuilderAccount[];
  rule?: DmRule;
  template?: RuleTemplate | null;
};

const INITIAL: RuleFormState = {};

type FollowUp = {
  key: number;
  text: string;
  delayMinutes: number;
  skipIfClicked: boolean;
};

const DELAY_CHOICES: { label: string; minutes: number }[] = [
  { label: "10 minutes", minutes: 10 },
  { label: "1 hour", minutes: 60 },
  { label: "6 hours", minutes: 360 },
  { label: "1 day", minutes: 1440 },
  { label: "3 days", minutes: 4320 },
];

const TRIGGERS: [DmTriggerType, string][] = [
  ["comment", "comments on a post or reel"],
  ["dm_keyword", "sends a DM"],
  ["story_reply", "replies to a story"],
];

export function RuleBuilder({ accounts, rule, template }: Props) {
  const [state, formAction, pending] = useActionState(saveRuleAction, INITIAL);
  const errors = state.errors ?? {};

  const firstStep = rule?.actions.find(
    (a) => a.type === "private_reply" || a.type === "message",
  );
  const firstButton = firstStep?.buttons?.[0];
  const publicReply = rule?.actions.find((a) => a.type === "comment_reply");
  const emailStep = rule?.actions.find(
    (a) => a.type === "message" && a.collect === "email",
  );
  // Follow-ups are the delayed message steps; the first DM has no delay.
  const existingFollowUps: FollowUp[] = (rule?.actions ?? [])
    .flatMap((a) => (a.type === "message" && a.delay_seconds ? [a] : []))
    .map((a, i) => ({
      key: i,
      text: a.text,
      delayMinutes: Math.round((a.delay_seconds ?? 0) / 60),
      skipIfClicked: a.type === "message" && a.skip_if_clicked === true,
    }));

  // A template only ever seeds a NEW rule. Applying one over an existing rule
  // would silently overwrite words somebody already wrote.
  const seed = rule ? null : (template?.values ?? null);

  const [name, setName] = useState(rule?.name ?? seed?.name ?? "");
  const [connectionId, setConnectionId] = useState(
    rule?.connection_id ?? accounts.find((a) => a.ready)?.id ?? "",
  );
  const [trigger, setTrigger] = useState<DmTriggerType>(
    rule?.trigger_type ?? seed?.trigger ?? "comment",
  );
  const [keywordMode, setKeywordMode] = useState<"any" | "keywords">(
    rule
      ? rule.keywords.length === 0 && rule.trigger_type !== "dm_keyword"
        ? "any"
        : "keywords"
      : (seed?.keywordMode ?? "keywords"),
  );
  const [keywords, setKeywords] = useState(
    rule?.keywords.join(", ") ?? seed?.keywords ?? "",
  );
  const [postScope, setPostScope] = useState<"any" | "specific">(
    rule && rule.target_post_ids.length > 0 ? "specific" : "any",
  );
  const [selectedPosts, setSelectedPosts] = useState<string[]>(
    rule?.target_post_ids ?? [],
  );
  const [posts, setPosts] = useState<RecentPost[] | null>(null);
  const [postsError, setPostsError] = useState<string | null>(null);
  const [dmText, setDmText] = useState(
    firstStep?.text ?? seed?.dmText ?? "",
  );
  const [buttonTitle, setButtonTitle] = useState(
    firstButton?.title ?? seed?.buttonTitle ?? "",
  );
  const [buttonUrl, setButtonUrl] = useState(
    firstButton?.url ?? seed?.buttonUrl ?? "",
  );
  const [showLink, setShowLink] = useState(
    Boolean(firstButton ?? seed?.buttonTitle),
  );
  const [commentReply, setCommentReply] = useState(
    publicReply?.text ?? seed?.commentReplyText ?? "",
  );
  const [collectEmail, setCollectEmail] = useState(
    Boolean(emailStep) || Boolean(seed?.collectEmail),
  );
  const [emailPrompt, setEmailPrompt] = useState(
    emailStep?.text ?? "What's the best email to send it to?",
  );
  const [followUps, setFollowUps] = useState<FollowUp[]>(
    rule
      ? existingFollowUps
      : (seed?.followUps ?? []).map((f, i) => ({
          key: i,
          text: f.text,
          delayMinutes: f.delayMinutes,
          skipIfClicked: f.skipIfClicked,
        })),
  );
  const [nextKey, setNextKey] = useState(
    Math.max(existingFollowUps.length, seed?.followUps?.length ?? 0),
  );

  const loadPosts = async (forConnection: string) => {
    setPosts(null);
    setPostsError(null);
    try {
      const response = await fetch(
        `/api/connections/${forConnection}/recent-posts`,
      );
      const body = (await response.json().catch(() => ({}))) as {
        posts?: RecentPost[];
        message?: string;
      };
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
    "mt-1 w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-50 outline-none transition placeholder:text-neutral-600 focus:border-neutral-500";
  const label = "text-sm font-medium text-neutral-300";
  const help = "mt-1 text-xs text-neutral-500";
  const err = (key: string) =>
    errors[key] ? (
      <p className="mt-1 text-xs text-red-400">{errors[key]}</p>
    ) : null;

  const keywordList = keywords
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);

  // The conversation, in the order it will actually happen.
  const preview: PreviewMessage[] = [];
  if (dmText) {
    preview.push({
      from: "business",
      text: dmText,
      buttonLabel: showLink && buttonTitle ? buttonTitle : undefined,
    });
  }
  if (showLink && buttonTitle) {
    preview.push({ from: "person", text: buttonTitle });
  }
  if (collectEmail) {
    preview.push({ from: "business", text: emailPrompt });
    preview.push({ from: "person", text: "sure — me@example.com" });
  }
  for (const followUp of followUps) {
    if (followUp.text) preview.push({ from: "business", text: followUp.text });
  }

  const account = accounts.find((a) => a.id === connectionId);

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_auto]">
      <form action={formAction} className="flex min-w-0 flex-col gap-4">
        {rule ? <input type="hidden" name="rule_id" value={rule.id} /> : null}
        {template && !rule ? (
          <input type="hidden" name="template_id" value={template.id} />
        ) : null}

        {state.message ? (
          <p
            aria-live="polite"
            className="rounded-lg border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-300"
          >
            {state.message}
          </p>
        ) : null}

        {template && !rule ? (
          <p className="rounded-lg border border-neutral-800 bg-neutral-900/60 px-3 py-2 text-sm text-neutral-400">
            Started from <span className="text-neutral-200">{template.name}</span>.
            Change anything — nothing here is fixed.
          </p>
        ) : null}

        <Card className="p-4">
          <label htmlFor="name" className={label}>
            Name this rule
          </label>
          <input
            id="name"
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Send the guide"
            className={input}
          />
          {err("name")}

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="connection_id" className={label}>
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
            </div>
            <div>
              <label htmlFor="folder" className={label}>
                Folder <span className="font-normal text-neutral-500">(optional)</span>
              </label>
              <input
                id="folder"
                name="folder"
                defaultValue={rule ? undefined : ""}
                placeholder="Launch"
                maxLength={60}
                className={input}
              />
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <p className={label}>When someone</p>
          <div className="mt-2 flex flex-col gap-2 text-sm text-neutral-200">
            {TRIGGERS.map(([value, text]) => (
              <label key={value} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="trigger"
                  value={value}
                  checked={trigger === value}
                  onChange={() => setTrigger(value)}
                  className="accent-emerald-500"
                />
                {text}
              </label>
            ))}
          </div>

          {trigger === "comment" ? (
            <div className="mt-4">
              <p className={label}>On which posts</p>
              <div className="mt-2 flex flex-wrap gap-4 text-sm text-neutral-200">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="post_scope"
                    value="any"
                    checked={postScope === "any"}
                    onChange={() => setPostScope("any")}
                    className="accent-emerald-500"
                  />
                  Any post or reel
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="post_scope"
                    value="specific"
                    checked={postScope === "specific"}
                    onChange={chooseSpecific}
                    className="accent-emerald-500"
                  />
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
                                setSelectedPosts((prev) =>
                                  on
                                    ? prev.filter((p) => p !== post.id)
                                    : [...prev, post.id],
                                )
                              }
                              aria-pressed={on}
                              className={`block w-full overflow-hidden rounded-md border text-left transition ${on ? "border-emerald-500" : "border-neutral-800 hover:border-neutral-600"}`}
                            >
                              {post.thumbnailUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element -- Instagram CDN thumbnails
                                <img
                                  src={post.thumbnailUrl}
                                  alt=""
                                  className="aspect-square w-full object-cover"
                                />
                              ) : (
                                <span className="block aspect-square w-full bg-neutral-900" />
                              )}
                              <span className="block truncate px-2 py-1 text-[11px] text-neutral-400">
                                {post.caption?.slice(0, 40) ||
                                  post.mediaType ||
                                  post.id}
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
            <p className={label}>
              And what they wrote
            </p>
            <div className="mt-2 flex flex-wrap gap-4 text-sm text-neutral-200">
              {trigger !== "dm_keyword" ? (
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="keyword_mode"
                    value="any"
                    checked={keywordMode === "any"}
                    onChange={() => setKeywordMode("any")}
                    className="accent-emerald-500"
                  />
                  Anything at all
                </label>
              ) : (
                <input type="hidden" name="keyword_mode" value="keywords" />
              )}
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="keyword_mode"
                  value="keywords"
                  checked={keywordMode === "keywords"}
                  onChange={() => setKeywordMode("keywords")}
                  className="accent-emerald-500"
                />
                A specific word or words
              </label>
            </div>
            {keywordMode === "keywords" ? (
              <div className="mt-2">
                <input
                  name="keywords"
                  value={keywords}
                  onChange={(e) => setKeywords(e.target.value)}
                  placeholder="LINK, guide, send it"
                  aria-label="Keywords, separated by commas"
                  className={input}
                />
                <p className={help}>
                  Separate keywords with commas. Matching ignores capitals.
                </p>
                {keywordList.length > 0 ? (
                  <p className="mt-2 flex flex-wrap gap-1">
                    {keywordList.map((word) => (
                      <Pill key={word}>{word}</Pill>
                    ))}
                  </p>
                ) : null}
                <label className="mt-2 flex items-center gap-2 text-xs text-neutral-400">
                  <input
                    type="checkbox"
                    name="keyword_match"
                    value="exact"
                    defaultChecked={rule?.config.keyword_match === "exact"}
                    className="accent-emerald-500"
                  />
                  Only when the whole message is exactly one of these words
                </label>
                {err("keywords")}
              </div>
            ) : null}
          </div>
        </Card>

        <Card className="p-4">
          <label htmlFor="dm_text" className={label}>
            They get this DM
          </label>
          <textarea
            id="dm_text"
            name="dm_text"
            rows={4}
            value={dmText}
            onChange={(e) => setDmText(e.target.value)}
            placeholder="Hey! Here's the guide you asked for 👇"
            className={input}
          />
          <p className={help}>
            Up to 1,000 characters. Instagram will not let an automation send a
            link out of nowhere — earn the reply here, and put the link on a
            button.
          </p>
          {err("dm_text")}

          {showLink ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_2fr]">
              <div>
                <label htmlFor="button_title" className="text-xs text-neutral-400">
                  Button label
                </label>
                <input
                  id="button_title"
                  name="button_title"
                  value={buttonTitle}
                  onChange={(e) => setButtonTitle(e.target.value)}
                  placeholder="Send me the link"
                  maxLength={20}
                  className={input}
                />
                {err("button_title")}
              </div>
              <div>
                <label htmlFor="button_url" className="text-xs text-neutral-400">
                  Link
                </label>
                <input
                  id="button_url"
                  name="button_url"
                  type="url"
                  value={buttonUrl}
                  onChange={(e) => setButtonUrl(e.target.value)}
                  placeholder="https://…"
                  className={input}
                />
                {err("button_url")}
              </div>
              <p className="text-xs text-neutral-500 sm:col-span-2">
                Clicks on this link are counted on the rule.
              </p>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowLink(true)}
              className="mt-3 text-xs text-neutral-300 underline-offset-2 hover:underline"
            >
              + Add a link
            </button>
          )}

          {trigger === "comment" ? (
            <div className="mt-5">
              <label htmlFor="comment_reply_text" className={label}>
                And a public reply under the comment{" "}
                <span className="font-normal text-neutral-500">(optional)</span>
              </label>
              <input
                id="comment_reply_text"
                name="comment_reply_text"
                value={commentReply}
                onChange={(e) => setCommentReply(e.target.value)}
                placeholder="Sent you a DM! 📩"
                className={input}
              />
              <p className={help}>
                Everyone sees this under the comment — it shows the others
                watching that the rule works.
              </p>
            </div>
          ) : null}
        </Card>

        <Card className="p-4">
          <label className="flex items-start gap-2 text-sm text-neutral-200">
            <input
              type="checkbox"
              name="collect_email"
              value="on"
              checked={collectEmail}
              onChange={(e) => setCollectEmail(e.target.checked)}
              className="mt-0.5 accent-emerald-500"
            />
            <span>
              And then ask for their email
              <span className="block text-xs text-neutral-500">
                Their next message is read as the answer and stored on the
                contact. If it is not an address, we stop waiting rather than
                swallowing everything else they say.
              </span>
            </span>
          </label>
          {collectEmail ? (
            <input
              name="email_prompt"
              value={emailPrompt}
              onChange={(e) => setEmailPrompt(e.target.value)}
              maxLength={200}
              className={`${input} mt-3`}
            />
          ) : null}
        </Card>

        <Card className="p-4">
          <p className={label}>
            Follow-ups{" "}
            <span className="font-normal text-neutral-500">(optional)</span>
          </p>
          <p className={help}>
            Extra DMs sent later. Instagram only allows them within 24 hours of
            the person&apos;s last message to you — a follow-up outside that
            window is skipped, not sent.
          </p>
          <ul className="mt-2 flex flex-col gap-3">
            {followUps.map((f, index) => (
              <li key={f.key} className="rounded-lg border border-neutral-800 p-3">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-xs text-neutral-400">
                    Wait{" "}
                    <select
                      name={`followup_delay_${index}`}
                      value={f.delayMinutes}
                      onChange={(e) =>
                        setFollowUps((prev) =>
                          prev.map((x) =>
                            x.key === f.key
                              ? { ...x, delayMinutes: Number(e.target.value) }
                              : x,
                          ),
                        )
                      }
                      className="rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs text-neutral-50"
                    >
                      {DELAY_CHOICES.map((d) => (
                        <option key={d.minutes} value={d.minutes}>
                          {d.label}
                        </option>
                      ))}
                      {!DELAY_CHOICES.some((d) => d.minutes === f.delayMinutes) ? (
                        <option value={f.delayMinutes}>
                          {f.delayMinutes} minutes
                        </option>
                      ) : null}
                    </select>{" "}
                    then send
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setFollowUps((prev) => prev.filter((x) => x.key !== f.key))
                    }
                    className="text-xs text-neutral-500 hover:text-red-300"
                  >
                    Remove
                  </button>
                </div>
                <textarea
                  name={`followup_text_${index}`}
                  rows={2}
                  value={f.text}
                  onChange={(e) =>
                    setFollowUps((prev) =>
                      prev.map((x) =>
                        x.key === f.key ? { ...x, text: e.target.value } : x,
                      ),
                    )
                  }
                  placeholder="Did the link work for you?"
                  className={input}
                />
                {showLink && buttonTitle ? (
                  <label className="mt-2 flex items-start gap-2 text-xs text-neutral-400">
                    <input
                      type="checkbox"
                      name={`followup_skip_${index}`}
                      value="on"
                      checked={f.skipIfClicked}
                      onChange={(e) =>
                        setFollowUps((prev) =>
                          prev.map((x) =>
                            x.key === f.key
                              ? { ...x, skipIfClicked: e.target.checked }
                              : x,
                          ),
                        )
                      }
                      className="mt-0.5 accent-emerald-500"
                    />
                    <span>
                      Only send this to people who never tapped the link
                      <span className="block text-neutral-600">
                        Chasing somebody who already did the thing is the
                        fastest way to be muted.
                      </span>
                    </span>
                  </label>
                ) : null}
                {err(`followup_delay_${index}`)}
              </li>
            ))}
          </ul>
          {followUps.length < 5 ? (
            <button
              type="button"
              onClick={() => {
                setFollowUps((prev) => [
                  ...prev,
                  {
                    key: nextKey,
                    text: "",
                    delayMinutes: 1440,
                    skipIfClicked: Boolean(showLink && buttonTitle),
                  },
                ]);
                setNextKey((k) => k + 1);
              }}
              className="mt-2 text-xs text-neutral-300 underline-offset-2 hover:underline"
            >
              + Add a follow-up
            </button>
          ) : null}
        </Card>

        <Card className="p-4">
          <label className="flex items-start gap-2 text-sm text-neutral-200">
            <input
              type="checkbox"
              name="once_per_contact"
              value="on"
              defaultChecked={
                rule
                  ? (rule.config.once_per_contact ??
                    rule.trigger_type === "comment")
                  : (seed?.oncePerContact ?? true)
              }
              className="mt-0.5 accent-emerald-500"
            />
            <span>
              Answer each person only once
              <span className="block text-xs text-neutral-500">
                Off means the same person gets the DM again every time they
                trigger the rule.
              </span>
            </span>
          </label>
        </Card>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Saving…" : rule ? "Save changes" : "Turn it on"}
          </button>
          <Link
            href="/dashboard/automations"
            className="text-sm text-neutral-400 hover:text-neutral-200"
          >
            Cancel
          </Link>
        </div>
      </form>

      <div className="lg:sticky lg:top-6 lg:self-start">
        <p className="mb-3 text-[10px] font-semibold tracking-widest text-neutral-500 uppercase">
          Preview
        </p>
        <PhonePreview
          accountName={account?.name ?? "your account"}
          trigger={
            trigger === "new_follower"
              ? "dm_keyword"
              : (trigger as "comment" | "dm_keyword" | "story_reply")
          }
          keywords={keywordList}
          commentReply={commentReply}
          messages={preview}
        />
      </div>
    </div>
  );
}
