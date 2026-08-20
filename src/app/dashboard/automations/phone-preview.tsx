"use client";

import { useState } from "react";

// What the person on the other end will actually see.
//
// The single most useful thing in a rule builder, because the builder's own
// language ("a private_reply step with one button") is not what arrives on
// somebody's phone. A preview that updates as the form changes turns "I think
// this is right" into "yes, that".
//
// Three surfaces because a comment rule touches three: the post, the comment
// thread underneath it, and the DM thread the reply opens.

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
      <div className="w-full max-w-[19rem] overflow-hidden rounded-[2rem] border-4 border-neutral-800 bg-black">
        <div className="flex items-center justify-between px-4 py-2 text-[10px] text-neutral-500">
          <span>{accountName}</span>
          <span>▁▂▃ ▮</span>
        </div>

        <div className="h-[26rem] overflow-y-auto bg-neutral-950 px-3 pb-4">
          {surface === "Post" ? (
            <div className="flex h-full flex-col">
              <div className="flex items-center gap-2 py-2">
                <span className="h-6 w-6 rounded-full bg-neutral-800" />
                <span className="text-xs text-neutral-300">{accountName}</span>
              </div>
              <div className="flex flex-1 items-center justify-center rounded-lg bg-neutral-900 text-xs text-neutral-600">
                your post
              </div>
              <div className="flex gap-3 py-2 text-neutral-400">
                <span>♡</span>
                <span>💬</span>
                <span>↗</span>
              </div>
              <p className="text-[11px] text-neutral-500">
                {trigger === "comment"
                  ? `Comment “${triggerWord}” and I'll send it over`
                  : "This rule does not run on posts."}
              </p>
            </div>
          ) : surface === "Comments" ? (
            <div className="flex flex-col gap-3 py-3">
              <p className="text-center text-[11px] text-neutral-600">
                Comments
              </p>
              {trigger === "comment" ? (
                <>
                  <Comment name="someone" text={triggerWord} />
                  {commentReply ? (
                    <div className="pl-8">
                      <Comment name={accountName} text={commentReply} own />
                    </div>
                  ) : (
                    <p className="pl-8 text-[11px] text-neutral-600">
                      No public reply — only the DM goes out.
                    </p>
                  )}
                </>
              ) : (
                <p className="text-[11px] text-neutral-600">
                  This rule is not triggered by comments.
                </p>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-2 py-3">
              <p className="text-center text-[11px] text-neutral-600">
                {accountName}
              </p>
              {trigger !== "comment" ? (
                <Bubble
                  from="person"
                  text={triggerWord}
                />
              ) : null}
              {messages.length === 0 ? (
                <p className="text-center text-[11px] text-neutral-600">
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

      <div className="flex gap-1 rounded-lg bg-neutral-900/60 p-1">
        {SURFACES.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setSurface(item)}
            className={`rounded-md px-3 py-1 text-xs transition ${
              surface === item
                ? "bg-neutral-800 font-medium text-neutral-50"
                : "text-neutral-500 hover:text-neutral-300"
            }`}
          >
            {item}
          </button>
        ))}
      </div>
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
      <span className="mt-0.5 h-5 w-5 shrink-0 rounded-full bg-neutral-800" />
      <p className="text-[11px] leading-relaxed">
        <span className={own ? "text-neutral-300" : "text-neutral-400"}>
          {name}
        </span>{" "}
        <span className="text-neutral-500">{text}</span>
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
        className={`max-w-[85%] rounded-2xl px-3 py-2 text-[11px] leading-relaxed whitespace-pre-wrap ${
          mine
            ? "bg-indigo-600 text-white"
            : "bg-neutral-800 text-neutral-100"
        }`}
      >
        {text}
        {buttonLabel ? (
          <span className="mt-2 block rounded-lg border border-neutral-600 bg-neutral-900 px-2 py-1 text-center text-[11px] text-neutral-200">
            {buttonLabel}
          </span>
        ) : null}
      </div>
    </div>
  );
}
