"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { Icon } from "@/components/icons";
import {
  Button,
  Card,
  Eyebrow,
  Notice,
  StickyPane,
  TwoPane,
  chipToggle,
  cx,
  destructiveButtonClass,
  segmentedItem,
  segmentedTrack,
  textButtonClass,
} from "@/components/ui";
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
  ["comment", "Comment"],
  ["dm_keyword", "DM"],
  ["story_reply", "Story reply"],
];

/** What a usable button link looks like. The same shape the DM worker needs,
 *  checked here so the person finds out while they are typing rather than when
 *  the save comes back. */
const URL_SHAPE = /^https?:\/\/\S+$/;

/** The section heading: a numeral in an accent disc beside an eyebrow. The
 *  builder reads as a numbered sentence, so the steps are numbered. */
function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-2.5">
      <span
        aria-hidden
        className="flex h-5 w-5 items-center justify-center rounded-full bg-accent-soft text-[11px] font-bold text-accent"
      >
        {n}
      </span>
      <span className="text-[13px] font-semibold tracking-[0.04em] text-muted uppercase">
        {children}
      </span>
    </p>
  );
}

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
  // The keyword being typed, kept separate from the committed list so Enter
  // means "that is a keyword" and a half-typed word never counts as one.
  const [keywordDraft, setKeywordDraft] = useState("");
  const [folder, setFolder] = useState(
    (rule as (DmRule & { folder?: string | null }) | undefined)?.folder ?? "",
  );
  const [exactMatch, setExactMatch] = useState(
    rule?.config.keyword_match === "exact",
  );
  const [oncePerContact, setOncePerContact] = useState(
    rule
      ? (rule.config.once_per_contact ?? rule.trigger_type === "comment")
      : (seed?.oncePerContact ?? true),
  );
  // Opened on load when it is already holding something, so a rule that does
  // three things does not look like a rule that does one.
  const [moreOpen, setMoreOpen] = useState(
    () =>
      Boolean(emailStep) ||
      Boolean(seed?.collectEmail) ||
      existingFollowUps.length > 0 ||
      (seed?.followUps?.length ?? 0) > 0,
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
    "mt-2 w-full rounded-[10px] border border-line bg-chip px-3.5 py-[10px] text-[14.5px] text-ink outline-none transition-[border-color] duration-150 placeholder:text-faint focus:border-accent";
  const label = "text-[13px] font-semibold text-muted";
  const help = "mt-2 text-[12.5px]/[18px] text-pretty text-faint";
  const err = (key: string) =>
    errors[key] ? (
      <p className="mt-1.5 text-[12.5px] text-danger">{errors[key]}</p>
    ) : null;

  const keywordList = keywords
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);

  const commitKeyword = () => {
    const word = keywordDraft.trim().replace(/,/g, "");
    setKeywordDraft("");
    if (!word || keywordList.includes(word)) return;
    setKeywords([...keywordList, word].join(","));
  };
  const removeKeyword = (word: string) =>
    setKeywords(keywordList.filter((k) => k !== word).join(","));

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
  // What the closed "More options" row says it is holding. A disclosure whose
  // summary is only the word "More" is a disclosure nobody opens, and these
  // are the settings people forget they turned on.
  const moreSummary = [
    folder ? `in ${folder}` : null,
    exactMatch ? "exact match" : null,
    oncePerContact ? "once per person" : null,
    collectEmail ? "asks for their email" : null,
    followUps.length > 0
      ? `${followUps.length} follow-up${followUps.length === 1 ? "" : "s"}`
      : null,
  ].filter(Boolean);

  const buttonUrlBad = showLink && buttonUrl.trim() !== "" && !URL_SHAPE.test(buttonUrl.trim());

  return (
    <TwoPane>
      <form
        action={formAction}
        className="flex min-w-[min(100%,400px)] flex-[1_1_460px] flex-col gap-4"
      >
        {rule ? <input type="hidden" name="rule_id" value={rule.id} /> : null}
        {template && !rule ? (
          <input type="hidden" name="template_id" value={template.id} />
        ) : null}
        {/* The chips are the control; this is what the action actually reads,
            so the server contract did not change when the input did. */}
        <input type="hidden" name="keywords" value={keywords} />

        {state.message ? (
          <Notice tone="danger" aria-live="polite">
            {state.message}
          </Notice>
        ) : null}

        {template && !rule ? (
          <Notice>
            Started from <span className="text-ink">{template.name}</span>.
            Change anything — nothing here is fixed.
          </Notice>
        ) : null}

        <Card>
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
        </Card>

        {/* ── 1. when this happens ──────────────────────────────────────── */}
        <Card>
          <Step n={1}>When this happens</Step>

          <p className={`${label} mt-4`}>On which account</p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {accounts.map((a) => (
              <label
                key={a.id}
                title={a.ready ? a.platformLabel : "Turn on automation for this account first"}
                className={cx(
                  chipToggle(connectionId === a.id),
                  a.ready ? "cursor-pointer" : "cursor-not-allowed opacity-45",
                )}
              >
                <input
                  type="radio"
                  name="connection_id"
                  value={a.id}
                  checked={connectionId === a.id}
                  disabled={!a.ready}
                  onChange={() => {
                    setConnectionId(a.id);
                    setSelectedPosts([]);
                    setPosts(null);
                  }}
                  className="sr-only"
                />
                {a.name}
              </label>
            ))}
          </div>
          {accounts.length === 0 ? (
            <p className={help}>
              No account has automation turned on yet.{" "}
              <Link href="/dashboard/automations" className="underline">
                Turn it on
              </Link>{" "}
              and come back — a rule needs an account to run on.
            </p>
          ) : null}
          {err("connection_id")}

          <p className={`${label} mt-5`}>When someone</p>
          <div className={cx(segmentedTrack, "mt-2.5 flex-wrap")}>
            {TRIGGERS.map(([value, text]) => (
              <label
                key={value}
                className={cx(segmentedItem(trigger === value), "cursor-pointer")}
              >
                <input
                  type="radio"
                  name="trigger"
                  value={value}
                  checked={trigger === value}
                  onChange={() => {
                    setTrigger(value);
                    // A DM rule with no keywords would answer every message
                    // ever sent to the account, so the validator refuses it —
                    // and the "anything at all" radio is not rendered for this
                    // trigger. Leaving it selected produced a form whose only
                    // error named a field that was not on screen.
                    if (value === "dm_keyword") setKeywordMode("keywords");
                  }}
                  className="sr-only"
                />
                {text}
              </label>
            ))}
          </div>

          <p className={`${label} mt-5`}>And what they wrote</p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {trigger !== "dm_keyword" ? (
              <label className={cx(chipToggle(keywordMode === "any"), "cursor-pointer")}>
                <input
                  type="radio"
                  name="keyword_mode"
                  value="any"
                  checked={keywordMode === "any"}
                  onChange={() => setKeywordMode("any")}
                  className="sr-only"
                />
                Any comment
              </label>
            ) : (
              <input type="hidden" name="keyword_mode" value="keywords" />
            )}
            <label
              className={cx(chipToggle(keywordMode === "keywords"), "cursor-pointer")}
            >
              <input
                type="radio"
                name="keyword_mode"
                value="keywords"
                checked={keywordMode === "keywords"}
                onChange={() => setKeywordMode("keywords")}
                className="sr-only"
              />
              These keywords
            </label>
          </div>

          {keywordMode === "keywords" ? (
            <div className="mt-3">
              {/* Chips rather than a comma-separated string. The old field
                  meant a keyword containing a comma was silently two, and it
                  gave no feedback that "LINK ,guide" had a stray space. */}
              <ul className="flex flex-wrap items-center gap-2">
                {keywordList.map((word) => (
                  <li key={word}>
                    <span className="inline-flex items-center gap-1.5 rounded-full border-[1.5px] border-accent bg-accent-soft py-[5px] pr-2 pl-3.5 text-[13px] font-semibold text-ink">
                      {word}
                      <button
                        type="button"
                        onClick={() => removeKeyword(word)}
                        aria-label={`Remove ${word}`}
                        className="text-faint transition-[color] duration-150 hover:text-danger"
                      >
                        <Icon name="close" className="h-3 w-3" strokeWidth={2.4} />
                      </button>
                    </span>
                  </li>
                ))}
                <li className="min-w-[9rem] flex-1">
                  <input
                    value={keywordDraft}
                    onChange={(e) => setKeywordDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === ",") {
                        e.preventDefault();
                        commitKeyword();
                      } else if (
                        e.key === "Backspace" &&
                        keywordDraft === "" &&
                        keywordList.length > 0
                      ) {
                        removeKeyword(keywordList[keywordList.length - 1]);
                      }
                    }}
                    onBlur={commitKeyword}
                    placeholder={keywordList.length ? "Add another…" : "LINK"}
                    aria-label="Add a keyword"
                    className="w-full rounded-full border border-line bg-panel px-3.5 py-[7px] text-[13px] text-ink outline-none transition-[border-color] duration-150 placeholder:text-faint focus:border-accent"
                  />
                </li>
              </ul>
              <p className={help}>
                {exactMatch
                  ? "Only fires when the whole message is exactly one of these words."
                  : "Fires when the message contains one of these words. Capitals are ignored."}{" "}
                Press Enter to add.
              </p>
              {err("keywords")}
            </div>
          ) : null}
        </Card>

        {/* ── 2. then send this ─────────────────────────────────────────── */}
        <Card>
          <Step n={2}>Then send this</Step>

          <label htmlFor="dm_text" className={`${label} mt-4 block`}>
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
            <div className="mt-4 grid gap-3 shell:grid-cols-[1fr_2fr]">
              <div>
                <label htmlFor="button_title" className={label}>
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
                <label htmlFor="button_url" className={label}>
                  Where it goes
                </label>
                <input
                  id="button_url"
                  name="button_url"
                  type="url"
                  value={buttonUrl}
                  onChange={(e) => setButtonUrl(e.target.value)}
                  placeholder="https://…"
                  aria-invalid={buttonUrlBad}
                  className={cx(input, buttonUrlBad && "border-danger")}
                />
                {buttonUrlBad ? (
                  <p className="mt-1.5 text-[12.5px] text-danger">
                    That button needs a full link, starting with https://
                  </p>
                ) : null}
                {err("button_url")}
              </div>
              <p className="text-[12.5px] text-faint sm:col-span-2">
                Clicks on this link are counted on the rule.
              </p>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowLink(true)}
              className={cx(textButtonClass, "mt-4 block")}
            >
              + Add a link
            </button>
          )}

          {trigger === "comment" ? (
            <div className="mt-5">
              <label htmlFor="comment_reply_text" className={label}>
                And a public reply under the comment{" "}
                <span className="font-normal text-faint">(optional)</span>
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

        {/* ── more options ─────────────────────────────────────────────── */}
        <details
          open={moreOpen}
          onToggle={(e) => setMoreOpen((e.target as HTMLDetailsElement).open)}
          className="rounded-2xl border border-line bg-panel"
        >
          <summary className="flex cursor-pointer list-none items-center gap-2.5 px-6 py-4">
            <Icon
              name={moreOpen ? "chevronUp" : "chevronDown"}
              className="h-4 w-4 text-faint"
            />
            <span className="text-[14.5px] font-semibold text-ink">
              More options
            </span>
            {!moreOpen && moreSummary.length > 0 ? (
              <span className="truncate text-[13px] text-faint">
                {moreSummary.join(" · ")}
              </span>
            ) : null}
          </summary>

          <div className="flex flex-col gap-5 border-t border-line px-6 py-5">
            <div>
              <label htmlFor="folder" className={label}>
                Folder <span className="font-normal text-faint">(optional)</span>
              </label>
              <input
                id="folder"
                name="folder"
                value={folder}
                onChange={(e) => setFolder(e.target.value)}
                placeholder="Launch"
                maxLength={60}
                className={input}
              />
            </div>

            {keywordMode === "keywords" ? (
              <label className="flex items-start gap-2.5 text-[14px] text-ink">
                <input
                  type="checkbox"
                  name="keyword_match"
                  value="exact"
                  checked={exactMatch}
                  onChange={(e) => setExactMatch(e.target.checked)}
                  className="mt-0.5 h-[15px] w-[15px] accent-[var(--accent)]"
                />
                <span>
                  Only when the whole message is exactly one of these words
                  <span className="mt-0.5 block text-[13px] text-faint">
                    Off, a comment that merely contains the word counts.
                  </span>
                </span>
              </label>
            ) : null}

            <label className="flex items-start gap-2.5 text-[14px] text-ink">
              <input
                type="checkbox"
                name="once_per_contact"
                value="on"
                checked={oncePerContact}
                onChange={(e) => setOncePerContact(e.target.checked)}
                className="mt-0.5 h-[15px] w-[15px] accent-[var(--accent)]"
              />
              <span>
                Answer each person only once
                <span className="mt-0.5 block text-[13px] text-faint">
                  Off means the same person gets the DM again every time they
                  trigger the rule.
                </span>
              </span>
            </label>

            <div>
              <label className="flex items-start gap-2.5 text-[14px] text-ink">
                <input
                  type="checkbox"
                  name="collect_email"
                  value="on"
                  checked={collectEmail}
                  onChange={(e) => setCollectEmail(e.target.checked)}
                  className="mt-0.5 h-[15px] w-[15px] accent-[var(--accent)]"
                />
                <span>
                  And then ask for their email
                  <span className="mt-0.5 block text-[13px] text-faint">
                    Their next message is read as the answer and stored on the
                    contact. If it is not an address, we stop waiting rather
                    than swallowing everything else they say.
                  </span>
                </span>
              </label>
              {collectEmail && trigger === "comment" ? (
                <Notice tone="warn" className="mt-3">
                  Instagram only lets an automation send a second message to
                  somebody who has messaged you. On a comment rule, the question
                  reaches the people who reply to your first DM and nobody else
                  — so a keyword-in-a-DM trigger collects far more addresses.
                </Notice>
              ) : null}
              {collectEmail ? (
                <input
                  name="email_prompt"
                  value={emailPrompt}
                  onChange={(e) => setEmailPrompt(e.target.value)}
                  maxLength={200}
                  aria-label="What to ask"
                  className={input}
                />
              ) : null}
            </div>

            <div>
              <p className={label}>
                Follow-ups{" "}
                <span className="font-normal text-faint">(optional)</span>
              </p>
              <p className={help}>
                Extra DMs sent later. Instagram only allows them within 24 hours
                of the person&apos;s last message to you — a follow-up outside
                that window is skipped, not sent.
              </p>
              {trigger === "comment" && followUps.length > 0 ? (
                <Notice tone="warn" className="mt-3">
                  Answering a comment does not open that window, and neither
                  does tapping your link. These follow-ups reach the people who
                  write back to your first DM, and are skipped for everyone else
                  — you will see them counted as &ldquo;not sent&rdquo;.
                </Notice>
              ) : null}
              <ul className="mt-3 flex flex-col gap-3">
                {followUps.map((f, index) => (
                  <li key={f.key} className="rounded-xl bg-chip p-4">
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-[13px] text-muted">
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
                          className="rounded-[9px] border border-line bg-panel px-2.5 py-1.5 text-[13px] text-ink"
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
                        className={destructiveButtonClass}
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
                      <label className="mt-3 flex items-start gap-2.5 text-[13px] text-muted">
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
                          className="mt-0.5 h-[15px] w-[15px] accent-[var(--accent)]"
                        />
                        <span>
                          Only send this to people who never tapped the link
                          <span className="mt-0.5 block text-faint">
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
                  className={cx(textButtonClass, "mt-3 block")}
                >
                  + Add a follow-up
                </button>
              ) : null}
            </div>
          </div>
        </details>

        {/* ── 3. on which posts ─────────────────────────────────────────── */}
        {trigger === "comment" ? (
          <Card>
            <Step n={3}>On which posts</Step>
            <div className="mt-4 flex flex-wrap gap-2">
              <label className={cx(chipToggle(postScope === "any"), "cursor-pointer")}>
                <input
                  type="radio"
                  name="post_scope"
                  value="any"
                  checked={postScope === "any"}
                  onChange={() => setPostScope("any")}
                  className="sr-only"
                />
                Any post or reel
              </label>
              <label
                className={cx(chipToggle(postScope === "specific"), "cursor-pointer")}
              >
                <input
                  type="radio"
                  name="post_scope"
                  value="specific"
                  checked={postScope === "specific"}
                  onChange={chooseSpecific}
                  className="sr-only"
                />
                Chosen posts
              </label>
            </div>

            {postScope === "specific" ? (
              <div className="mt-4">
                {selectedPosts.map((id) => (
                  <input key={id} type="hidden" name="post_ids" value={id} />
                ))}
                {posts === null && !postsError ? (
                  <p className={help}>Loading recent posts…</p>
                ) : postsError ? (
                  <p className="mt-1.5 text-[13px] text-danger">{postsError}</p>
                ) : posts && posts.length === 0 ? (
                  <p className={help}>No recent posts found on this account.</p>
                ) : (
                  <>
                    {selectedPosts.length === 0 ? (
                      <Notice tone="warn" className="mb-3">
                        Pick at least one — a rule scoped to nothing never runs.
                      </Notice>
                    ) : null}
                    <ul className="grid grid-cols-2 gap-2.5 shell:grid-cols-4">
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
                              className={cx(
                                "block w-full overflow-hidden rounded-xl border-2 text-left transition-[border-color] duration-150",
                                on ? "border-accent" : "border-line hover:border-line-strong",
                              )}
                            >
                              {post.thumbnailUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element -- Instagram CDN thumbnails
                                <img
                                  src={post.thumbnailUrl}
                                  alt=""
                                  className="aspect-square w-full object-cover"
                                />
                              ) : (
                                <span className="block aspect-square w-full bg-chip" />
                              )}
                              <span className="block truncate px-2.5 py-1.5 text-[12px] text-muted">
                                {post.caption?.slice(0, 40) ||
                                  post.mediaType ||
                                  post.id}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </>
                )}
                {err("post_ids")}
              </div>
            ) : null}
          </Card>
        ) : null}

        <div className="flex items-center gap-4">
          <Button type="submit" tone="primary" disabled={pending}>
            {pending ? "Saving…" : rule ? "Save changes" : "Turn it on"}
          </Button>
          <Link
            href="/dashboard/automations"
            className="text-[14px] text-muted transition hover:text-ink"
          >
            Cancel
          </Link>
        </div>
      </form>

      <StickyPane className="min-w-[280px] flex-[0_1_320px]">
        <Eyebrow className="mb-3">Preview</Eyebrow>
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
      </StickyPane>
    </TwoPane>
  );
}
