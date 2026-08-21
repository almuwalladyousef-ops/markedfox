"use client";

import { useState } from "react";

import { segmentedItem, segmentedTrack } from "@/components/ui";

// What the person on the other end will actually see.
//
// The single most useful thing in a rule builder, because the builder's own
// language ("a private_reply step with one button") is not what arrives on
// somebody's phone. A preview that updates as the form changes turns "I think
// this is right" into "yes, that".
//
// Three surfaces because a comment rule touches three: the post, the comment
// thread underneath it, and the DM thread the reply opens.
//
// The phone's interior is dark in both themes on purpose: it is a rendering of
// Instagram, not of MarkedFox, and a white "Instagram" beside a dark one would
// be a preview of something that does not exist.

export type PreviewMessage = {
  from: "business" | "person";
  text: string;
  buttonLabel?: string;
};

const SURFACES = ["Post", "Comments", "DM"] as const;
type Surface = (typeof SURFACES)[number];

export function PhonePreview({
  accountName,
  trigger,
  keywords,
  commentReply,
  messages,
}: {
  accountName: string;
  trigger: "comment" | "dm_keyword" | "story_reply";
  keywords: string[];
  commentReply: string;
  messages: PreviewMessage[];
}) {
  // A DM rule has no post and no comment thread, so starting on "Post" would
  // show an empty frame for the one trigger where it means nothing.
  const [surface, setSurface] = useState<Surface>(
    trigger === "comment" ? "Comments" : "DM",
  );

  const triggerWord = keywords[0] ?? "hello";

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="w-full max-w-[290px] overflow-hidden rounded-[30px] border-4 border-line-strong bg-black">
        <div className="flex items-center justify-between px-4 py-2 text-[9.5px] text-[#7a7a82]">
          <span>{accountName}</span>
          <span>▁▂▃ ▮</span>
        </div>

        <div className="h-[400px] overflow-y-auto bg-[#0d0d0f] px-3 pb-3.5">
          {surface === "Post" ? (
            <div className="flex h-full flex-col">
              <div className="flex items-center gap-2 py-2">
                <span className="h-6 w-6 rounded-full bg-gradient-to-br from-[#f97316] to-[#c2410c]" />
                <span className="text-[11px] text-[#ececf0]">{accountName}</span>
              </div>
              <div className="flex flex-1 items-center justify-center rounded-lg bg-[#1a1a1e] text-[11px] text-[#5c5c64]">
                your post
              </div>
              <div className="flex gap-3 py-2 text-[#9d9da6]">
                <span>♡</span>
                <span>💬</span>
                <span>↗</span>
              </div>
              <p className="text-[11px] text-[#5c5c64]">
                {trigger === "comment"
                  ? `Comment “${triggerWord}” and I'll send it over`
                  : "This rule does not run on posts."}
              </p>
            </div>
          ) : surface === "Comments" ? (
            <div className="flex flex-col gap-3 py-3">
              <p className="text-center text-[10px] text-[#5c5c64]">
                Comments
              </p>
              {trigger === "comment" ? (
                <>
                  <Comment name="someone" text={triggerWord} />
                  {commentReply ? (
                    <div className="pl-[26px]">
                      <Comment name={accountName} text={commentReply} own />
                    </div>
                  ) : (
                    <p className="pl-[26px] text-[11px] text-[#5c5c64]">
                      No public reply — only the DM goes out.
                    </p>
                  )}
                </>
              ) : (
                <p className="text-[11px] text-[#5c5c64]">
                  This rule is not triggered by comments.
                </p>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-2 py-3">
              <p className="text-center text-[10px] text-[#5c5c64]">
                {accountName}
              </p>
              {trigger !== "comment" ? (
                <Bubble
                  from="person"
                  text={triggerWord}
                />
              ) : null}
              {messages.length === 0 ? (
                <p className="text-center text-[10px] text-[#5c5c64]">
                  Write the first message and it appears here.
                </p>
              ) : (
                messages.map((message, index) => (
                  <Bubble
                    key={index}
                    from={message.from}
                    text={message.text}
                    buttonLabel={message.buttonLabel}
                  />
                ))
              )}
            </div>
          )}
        </div>
      </div>

      <div className={segmentedTrack}>
        {SURFACES.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setSurface(item)}
            aria-pressed={surface === item}
            className={segmentedItem(surface === item)}
          >
            {item}
          </button>
        ))}
      </div>

      <p className="max-w-[290px] text-center text-[11px]/[16px] text-faint">
        What the person on the other end will actually see — it updates as you
        type.
      </p>
    </div>
  );
}

function Comment({
  name,
  text,
  own,
}: {
  name: string;
  text: string;
  own?: boolean;
}) {
  return (
    <div className="flex gap-2">
      <span
        className={`mt-0.5 h-5 w-5 shrink-0 rounded-full ${
          own
            ? "bg-gradient-to-br from-[#f97316] to-[#c2410c]"
            : "bg-[#232327]"
        }`}
      />
      <p className="text-[11px]/[16px]">
        <span className="font-semibold text-[#ececf0]">{name}</span>{" "}
        <span className="text-[#9d9da6]">{text}</span>
      </p>
    </div>
  );
}

function Bubble({
  from,
  text,
  buttonLabel,
}: {
  from: "business" | "person";
  text: string;
  buttonLabel?: string;
}) {
  const mine = from === "person";
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-3 py-2 text-[11px]/[16px] whitespace-pre-wrap ${
          mine ? "bg-[#4f46e5] text-white" : "bg-[#232327] text-[#ececf0]"
        }`}
      >
        {text}
        {buttonLabel ? (
          <span className="mt-2 block rounded-[9px] border border-[#3f3f46] bg-[#101012] px-2 py-1 text-center text-[11px] text-[#ececf0]">
            {buttonLabel}
          </span>
        ) : null}
      </div>
    </div>
  );
}
