"use client";

import { useEffect, useState } from "react";

import { Icon } from "@/components/icons";
import { cx } from "@/components/ui";

import { Avatar, Bubble, Comment, Phone } from "./mocks";

// The one interactive thing on the landing page: pick what a rule should do,
// and watch what arrives on the other person's phone.
//
// Every scenario here is one of the app's own rule templates
// (src/lib/dm/templates.ts) with its real copy, so the demo can only ever
// promise something the builder ships pre-filled. The two constraints the
// templates are shaped by are shown rather than hidden: Instagram allows one
// DM in answer to a comment and the first message has to earn a reply before
// a link, and a second question (the email) is only deliverable to somebody
// who messaged first — which is why "Grow your email list" is DM-triggered.

type Beat =
  | { on: "comments"; kind: "comment" | "reply"; text: string }
  | { on: "dm"; kind: "person" | "business"; text: string; button?: string }
  | { on: "dm"; kind: "note"; text: string };

type Scenario = {
  id: string;
  name: string;
  trigger: string;
  keyword: string;
  sentence: string;
  beats: Beat[];
};

const SCENARIOS: Scenario[] = [
  {
    id: "link",
    name: "Auto-DM a link from comments",
    trigger: "Post or reel comment",
    keyword: "link",
    sentence:
      "When someone comments “link” on any post, DM them the link and reply publicly so everyone else sees it worked.",
    beats: [
      { on: "comments", kind: "comment", text: "link 🙏" },
      { on: "comments", kind: "reply", text: "Just sent it to your DMs 📩" },
      {
        on: "dm",
        kind: "business",
        text: "Hey! Thanks so much for your interest 😊 Tap below and I'll send the link straight over.",
        button: "Send me the link",
      },
      { on: "dm", kind: "person", text: "Send me the link" },
      {
        on: "dm",
        kind: "business",
        text: "Here you go 👇",
        button: "Open the guide",
      },
      { on: "dm", kind: "note", text: "Tap counted on the rule · 0.9s after the comment" },
    ],
  },
  {
    id: "faq",
    name: "Answer a question people keep asking",
    trigger: "DM keyword",
    keyword: "price",
    sentence:
      "When a DM contains “price”, “pricing” or “how much”, answer it — every time, not once per person.",
    beats: [
      { on: "dm", kind: "person", text: "hey, how much is the 8-week program?" },
      {
        on: "dm",
        kind: "business",
        text: "Great question — here's exactly how the pricing works, and what's included at each level.",
        button: "See the levels",
      },
      { on: "dm", kind: "note", text: "Answered in 1.2s · no cap on repeats" },
    ],
  },
  {
    id: "email",
    name: "Grow your email list",
    trigger: "DM keyword",
    keyword: "guide",
    sentence:
      "When a DM contains “guide” or “freebie”, offer it, ask for the email, and keep the address on the contact.",
    beats: [
      { on: "dm", kind: "person", text: "can I get the guide?" },
      { on: "dm", kind: "business", text: "Happy to send it over — it's a good one 👇" },
      { on: "dm", kind: "business", text: "What's the best email to send it to?" },
      { on: "dm", kind: "person", text: "sam.reyes@example.com" },
      { on: "dm", kind: "note", text: "Email saved on the contact · exportable any time" },
    ],
  },
  {
    id: "giveaway",
    name: "Run a giveaway",
    trigger: "Post or reel comment",
    keyword: "enter",
    sentence:
      "When someone comments “enter”, “me” or “in”, confirm the entry publicly and in their DMs — once per person.",
    beats: [
      { on: "comments", kind: "comment", text: "enter!!" },
      { on: "comments", kind: "reply", text: "You're in! Check your DMs 🎉" },
      {
        on: "dm",
        kind: "business",
        text: "You're entered 🎉 Winners are announced on Friday, right here in your DMs.",
      },
      { on: "dm", kind: "note", text: "Second “enter” from the same person: ignored" },
    ],
  },
];

const ACCOUNT = "maya.kim";
const PERSON = "sam.reyes";

export function AutomationDemo() {
  // Which scenario, and how many of its beats are on screen. One state so a
  // click resets the count in the same render it swaps the thread.
  const [state, setState] = useState({ id: SCENARIOS[0].id, shown: 0 });
  const active = SCENARIOS.find((scenario) => scenario.id === state.id) ?? SCENARIOS[0];
  const shown = state.shown;

  // The thread plays out on a timer, the way it would on a phone.
  // Reduced-motion shows the whole thing at once, because a staged reveal is
  // motion whatever it is made of.
  useEffect(() => {
    const total = active.beats.length;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      const once = window.setTimeout(
        () => setState((current) => ({ ...current, shown: total })),
        0,
      );
      return () => window.clearTimeout(once);
    }
    let count = 0;
    const timer = window.setInterval(() => {
      count += 1;
      setState((current) => ({ ...current, shown: Math.min(count, total) }));
      if (count >= total) window.clearInterval(timer);
    }, 650);
    return () => window.clearInterval(timer);
  }, [active]);

  const visible = active.beats.slice(0, shown);
  const comments = visible.filter((b) => b.on === "comments");
  const dms = visible.filter((b) => b.on === "dm");
  const hasComments = active.beats.some((b) => b.on === "comments");

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-8 wide:grid-cols-[minmax(0,1fr)_auto] wide:gap-14">
      <div>
        <div
          role="tablist"
          aria-label="Automation examples"
          className="flex flex-col gap-1.5"
        >
          {SCENARIOS.map((scenario) => {
            const selected = scenario.id === active.id;
            return (
              <button
                key={scenario.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setState({ id: scenario.id, shown: 0 })}
                className={cx(
                  "flex items-center justify-between gap-4 rounded-lg px-4 py-3 text-left transition-[background-color,color] duration-110",
                  selected
                    ? "bg-panel text-ink shadow-e1"
                    : "text-muted hover:bg-panel hover:text-ink",
                )}
              >
                <span className="text-[15px] font-semibold">{scenario.name}</span>
                <span className="hidden shrink-0 text-[12px] text-faint sm:inline">
                  {scenario.trigger}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-6 rounded-2xl border border-line bg-panel p-5">
          <p className="text-[12px] font-semibold text-faint">The rule, as the builder writes it</p>
          <p className="mt-2 text-[16px]/[24px] text-ink text-pretty">{active.sentence}</p>
          <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-muted">
            <li className="flex items-center gap-1.5">
              <Icon name="check" className="h-3.5 w-3.5 text-accent" />
              Live preview while you write it
            </li>
            <li className="flex items-center gap-1.5">
              <Icon name="check" className="h-3.5 w-3.5 text-accent" />
              Every button is a tracked link
            </li>
            <li className="flex items-center gap-1.5">
              <Icon name="check" className="h-3.5 w-3.5 text-accent" />
              Runs, sends, clicks and CTR on the rule
            </li>
          </ul>
        </div>
      </div>

      <div className="mx-auto" aria-live="polite">
        <Phone>
        <div className="flex h-[440px] flex-col">
          {hasComments ? (
            <div className="border-b border-[var(--mk-line)] px-4 pt-2 pb-3">
              <p className="mb-2 text-center text-[10px] font-semibold text-[var(--mk-faint)]">
                Comments
              </p>
              <div className="flex flex-col gap-2.5">
                {comments.map((beat, index) =>
                  beat.on === "comments" ? (
                    <div
                      key={index}
                      className={cx("mf-enter", beat.kind === "reply" && "pl-[30px]")}
                    >
                      <Comment
                        name={beat.kind === "reply" ? ACCOUNT : PERSON}
                        own={beat.kind === "reply"}
                      >
                        {beat.text}
                      </Comment>
                    </div>
                  ) : null,
                )}
                {comments.length === 0 ? (
                  <p className="text-[11px] text-[var(--mk-faint)]">Waiting for a comment…</p>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="flex flex-1 flex-col px-3 pt-2 pb-3">
            <div className="mb-2 flex items-center gap-2 px-1">
              <Avatar name={ACCOUNT} size={22} />
              <span className="text-[11px] font-semibold text-[var(--mk-text)]">{ACCOUNT}</span>
              <span className="ml-auto rounded-full bg-[var(--mk-chip)] px-2 py-[2px] text-[9.5px] font-semibold text-[var(--mk-muted)]">
                Automated
              </span>
            </div>
            <div className="flex flex-1 flex-col justify-end gap-2">
              {dms.map((beat, index) =>
                beat.on === "dm" ? (
                  beat.kind === "note" ? (
                    <p
                      key={index}
                      className="mf-enter pt-1 text-center text-[10.5px] font-medium text-ok"
                    >
                      {beat.text}
                    </p>
                  ) : (
                    <Bubble
                      key={index}
                      from={beat.kind}
                      button={beat.button}
                      className="mf-enter"
                    >
                      {beat.text}
                    </Bubble>
                  )
                ) : null,
              )}
            </div>
          </div>
        </div>
        </Phone>
      </div>
    </div>
  );
}
