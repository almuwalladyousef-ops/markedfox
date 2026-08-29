"use client";

import { useState } from "react";

import { Icon } from "@/components/icons";
import { cx, segmentedItem, segmentedTrack } from "@/components/ui";

// Categorised, because a person deciding whether to pay has one kind of
// question and a person deciding whether to trust the app with their
// Instagram login has another, and one long list makes both scroll past the
// other's answers.
//
// Every answer states what the product does today. Where a platform gates a
// capability behind its own review, the answer says so — a landing page that
// promises a platform the review has not cleared is a promise the app then
// has to break on the connect screen.

type Category = "General" | "Publishing" | "Automation" | "Research" | "Billing";

const FAQ: Record<Category, { q: string; a: string }[]> = {
  General: [
    {
      q: "Who is MarkedFox for?",
      a: "Creators posting to more than one platform, businesses answering the same questions in their DMs, and agencies running several brands. Each brand or client is a workspace with its own connected accounts — two workspaces on Free, five on Pro, ten on Studio.",
    },
    {
      q: "Do I have to give you my passwords?",
      a: "No. Every platform is connected through its own official login. You approve the permissions on the platform’s page, and MarkedFox stores an encrypted token it can revoke — never your password. Disconnect from Settings at any time and the token is deleted.",
    },
    {
      q: "Will this get my account locked?",
      a: "MarkedFox uses each platform’s official API, inside the limits each platform sets, and asks for its share of that limit before spending it. It never drives a browser, never uses unofficial endpoints, and never uses your login session.",
    },
    {
      q: "Do I need to know how to code?",
      a: "No. The composer is a form. A rule is a sentence — “when someone comments this, send that” — with a live preview of what arrives on the other person’s phone. Research is a feed.",
    },
    {
      q: "Does it work on my phone?",
      a: "Yes, in the browser. The dashboard is built for a phone screen: a bottom tab bar with New post in the centre, and every screen laid out for one hand. Native apps come after the web launch.",
    },
  ],
  Publishing: [
    {
      q: "Which platforms can I post to?",
      a: "Instagram (Reels, photos, carousels), Facebook Pages, Threads, TikTok, YouTube (Shorts and long videos up to 256GB), X, and Snapchat Spotlight. LinkedIn and Pinterest follow after launch. Each platform reviews third-party apps separately: Instagram, Facebook and Threads are open now, and the others switch on inside the app as each review clears — the platform’s toggle tells you its status.",
    },
    {
      q: "Can I schedule posts?",
      a: "On Pro and Studio. Free can post now and save drafts. The reason is a real cost rather than packaging: a scheduled post’s video is uploaded when you press Schedule and waits in storage until it goes out, which may be weeks.",
    },
    {
      q: "What happens if one platform fails?",
      a: "The others still go out. The post is marked partial, with which platform failed and why, right on the calendar — and you retry only the one that failed.",
    },
    {
      q: "Do you re-encode my video?",
      a: "No. Trim and volume run in your browser and the video stream is never re-encoded, so a trim is a cut at the nearest keyframe and an untouched clip uploads byte for byte. Uploads go straight from your browser to storage, and media is deleted after it publishes.",
    },
    {
      q: "Why is X treated differently?",
      a: "X charges for every post made through its API — $0.015, and $0.20 when the post contains a link. So X is not on Free, carries a hard 300 posts a month on every paid plan, and links in X posts are blocked before they cost you thirteen times as much.",
    },
  ],
  Automation: [
    {
      q: "Which platforms do automations run on?",
      a: "Instagram: comments on posts and reels, DMs containing a keyword, and replies to your stories. The engine is built for one Meta webhook, so it is the same rules screen whichever account a rule runs on.",
    },
    {
      q: "Can it send a link straight from a comment?",
      a: "Instagram allows exactly one DM in answer to a comment, and a first message that opens with a link is the one Instagram is most likely to drop. The templates are shaped by that: the first message earns a tap, and the link goes in the reply. You see all of it in the preview before the rule is live.",
    },
    {
      q: "Will it sound like a robot?",
      a: "It sends exactly the words you wrote, once per person by default, and the public reply is also yours. Nothing is generated at send time.",
    },
    {
      q: "What about people who never tap the link?",
      a: "A follow-up after a delay you choose, sent only to people who did not tap — chasing somebody who already took the action is the fastest way to be muted. Instagram only lets a follow-up reach somebody who has messaged you, and the builder says so on the step.",
    },
    {
      q: "Can I collect emails?",
      a: "Yes. A step asks for the email inside the DM and keeps the address on the contact. The rule shows how many it collected beside its runs, sends and clicks, and the list exports with the rest of your data.",
    },
    {
      q: "Is there a limit on sends?",
      a: "Free includes one rule and 200 DM sends a month; Pro and Studio include unlimited rules and 10,000 sends a month, pooled across your workspaces. The cap is checked before a message goes, never after.",
    },
  ],
  Research: [
    {
      q: "What counts as an outlier?",
      a: "Every video is scored against its own channel’s median over that channel’s last twenty videos, once it is 48 hours old. Two times the median is an outlier; ten times, on a channel with at least ten videos behind it, is a validated one. On too little data the feed shows a dash rather than a confident wrong number.",
    },
    {
      q: "Which platforms can it read?",
      a: "YouTube: any public channel. Instagram: any public business account, read through one of your connected accounts — Instagram hides view counts there, so likes carry the baseline and the card says so. TikTok: only your own connected account, because TikTok’s research API is academic-only. X: works, but X bills per read, and the app tells you before it spends.",
    },
    {
      q: "Does it copy other people’s videos?",
      a: "No. The breakdown names the hook pattern, the idea and the execution separately, and generation feeds on that breakdown — it never sees the original wording. Copying somebody’s structure while keeping their idea is plagiarism; the reverse is a different video.",
    },
    {
      q: "What do research credits pay for?",
      a: "Each AI generation — a breakdown, a set of hooks, an outline, a script — is one credit, charged only after the model answers. Studio includes 100 a month. Watching channels and reading the feed cost nothing.",
    },
  ],
  Billing: [
    {
      q: "Is there a free plan?",
      a: "Yes: two workspaces, three connected accounts in each, two posts a day, and one DM rule with 200 sends a month. No card and no trial clock.",
    },
    {
      q: "Monthly or annual?",
      a: "Both. Annual is two months free — Pro is $200 a year instead of $240, Studio $490 instead of $588.",
    },
    {
      q: "What happens if a payment fails?",
      a: "The account drops to Free limits. Nothing is deleted and no account is disconnected; fix the card in Billing and the limits come back.",
    },
    {
      q: "Can I cancel or delete everything?",
      a: "Cancel from the billing portal at any time. Delete account in Settings removes every row that is yours, including the encrypted platform tokens — export first if you want a copy.",
    },
    {
      q: "What is Enterprise?",
      a: "Raised caps on X posts, DM sends and research credits, and unlimited workspaces, for a team or an agency that outgrows Studio. Email hello@markedfox.com.",
    },
  ],
};

const CATEGORIES = Object.keys(FAQ) as Category[];

export function Faq() {
  const [category, setCategory] = useState<Category>("General");
  return (
    <div>
      <div className="mf-noscroll -mx-6 overflow-x-auto px-6">
        <div role="tablist" aria-label="Question categories" className={segmentedTrack}>
          {CATEGORIES.map((name) => (
            <button
              key={name}
              type="button"
              role="tab"
              aria-selected={category === name}
              onClick={() => setCategory(name)}
              className={segmentedItem(category === name)}
            >
              {name}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 divide-y divide-line border-y border-line">
        {FAQ[category].map((item) => (
          <details key={item.q} className="group">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-4 text-[16px] font-semibold text-ink [&::-webkit-details-marker]:hidden">
              <h3 className="text-[16px] font-semibold text-ink">{item.q}</h3>
              <span
                aria-hidden
                className={cx(
                  "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-chip text-muted transition-[background-color,color] duration-110",
                  "group-open:bg-accent group-open:text-accent-ink",
                )}
              >
                <Icon name="plus" className="h-3.5 w-3.5 transition-transform duration-160 group-open:rotate-45" />
              </span>
            </summary>
            <p className="max-w-[68ch] pb-5 text-[15px]/[23px] text-muted text-pretty">
              {item.a}
            </p>
          </details>
        ))}
      </div>
    </div>
  );
}
