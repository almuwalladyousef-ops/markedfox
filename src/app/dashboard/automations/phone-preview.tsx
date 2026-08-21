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
      <div className="w-full max-w-[19rem] overflow-hidden rounded-[2rem] border-4 border-line bg-black">
        <div className="flex items-center justify-between px-4 py-2 text-[10px] text-faint">
          <span>{accountName}</span>
          <span>▁▂▃ ▮</span>
        </div>

        <div className="h-[26rem] overflow-y-auto bg-panel px-3 pb-4">
          {surface === "Post" ? (
            <div className="flex h-full flex-col">
              <div className="flex items-center gap-2 py-2">
                <span className="h-6 w-6 rounded-full bg-chip" />
                <span className="text-xs text-ink">{accountName}</span>
              </div>
              <div className="flex flex-1 items-center justify-center rounded-lg bg-chip text-xs text-faint">
                your post
              </div>
              <div className="flex gap-3 py-2 text-muted">
                <span>♡</span>
                <span>💬</span>
                <span>↗</span>
              </div>
              <p className="text-[11px] text-faint">
                {trigger === "comment"
                  ? `Comment “${triggerWord}” and I'll send it over`
                  : "This rule does not run on posts."}
              </p>
            </div>
          ) : surface === "Comments" ? (
            <div className="flex flex-col gap-3 py-3">
              <p className="text-center text-[11px] text-faint">
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
                    <p className="pl-8 text-[11px] text-faint">
                      No public reply — only the DM goes out.
                    </p>
                  )}
                </>
              ) : (
                <p className="text-[11px] text-faint">
                  This rule is not triggered by comments.
                </p>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-2 py-3">
              <p className="text-center text-[11px] text-faint">
                {accountName}
              </p>
              {trigger !== "comment" ? (
                <Bubble
                  from="person"
                  text={triggerWord}
                />
              ) : null}
              {messages.length === 0 ? (
                <p className="text-center text-[11px] text-faint">
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

      <div className="flex gap-1 rounded-lg bg-chip p-1">
        {SURFACES.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setSurface(item)}
            className={`rounded-md px-3 py-1 text-xs transition ${
              surface === item
                ? "bg-chip font-medium text-ink"
                : "text-faint hover:text-ink"
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
      <span className="mt-0.5 h-5 w-5 shrink-0 rounded-full bg-chip" />
      <p className="text-[11px] leading-relaxed">
        <span className={own ? "text-ink" : "text-muted"}>
          {name}
        </span>{" "}
        <span className="text-faint">{text}</span>
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
            : "bg-chip text-ink"
        }`}
      >
        {text}
        {buttonLabel ? (
          <span className="mt-2 block rounded-lg border border-line-strong bg-chip px-2 py-1 text-center text-[11px] text-ink">
            {buttonLabel}
          </span>
        ) : null}
      </div>
    </div>
  );
}
