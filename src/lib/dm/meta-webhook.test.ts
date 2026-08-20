import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { parseInstagramWebhook, verifyMetaSignature } from "./meta-webhook";

describe("verifyMetaSignature", () => {
  const body = '{"object":"instagram","entry":[]}';
  const sig = `sha256=${createHmac("sha256", "app-secret").update(body).digest("hex")}`;

  it("accepts the right signature over the raw body and nothing else", () => {
    expect(verifyMetaSignature(body, sig, "app-secret")).toBe(true);
    expect(verifyMetaSignature(body, sig, "other")).toBe(false);
    expect(verifyMetaSignature(body + " ", sig, "app-secret")).toBe(false);
    expect(verifyMetaSignature(body, null, "app-secret")).toBe(false);
    expect(verifyMetaSignature(body, "sha1=abc", "app-secret")).toBe(false);
    expect(verifyMetaSignature(body, "sha256=zz", "app-secret")).toBe(false);
  });
});

describe("parseInstagramWebhook", () => {
  it("normalises a comment change", () => {
    const events = parseInstagramWebhook({
      object: "instagram",
      entry: [
        {
          id: "17841400000000000",
          time: 1755600000,
          changes: [
            {
              field: "comments",
              value: {
                id: "17900000000000001",
                text: "LINK please",
                from: { id: "9001", username: "fan_one" },
                media: { id: "17850000000000002", media_product_type: "FEED" },
              },
            },
          ],
        },
      ],
    });
    expect(events).toEqual([
      {
        kind: "comment",
        platform: "instagram",
        externalId: "ig-comment:17900000000000001",
        platformAccountId: "17841400000000000",
        from: { id: "9001", username: "fan_one" },
        text: "LINK please",
        mediaId: "17850000000000002",
        parentCommentId: undefined,
        occurredAt: new Date(1755600000 * 1000),
      },
    ]);
  });

  it("normalises messages, echoes, story replies, and postbacks", () => {
    const events = parseInstagramWebhook({
      object: "instagram",
      entry: [
        {
          id: "178414",
          time: 1755600000,
          messaging: [
            { sender: { id: "9001" }, recipient: { id: "178414" }, timestamp: 1755600001000, message: { mid: "m1", text: "hi" } },
            { sender: { id: "178414" }, recipient: { id: "9001" }, timestamp: 1755600002000, message: { mid: "m2", text: "our reply", is_echo: true } },
            {
              sender: { id: "9002" },
              recipient: { id: "178414" },
              timestamp: 1755600003000,
              message: { mid: "m3", text: "love this", reply_to: { story: { id: "s1", url: "https://..." } } },
            },
            { sender: { id: "9001" }, recipient: { id: "178414" }, timestamp: 1755600004000, postback: { mid: "m4", payload: "step:2", title: "Yes" } },
          ],
        },
      ],
    });
    expect(events.map((e) => e.kind)).toEqual(["message", "message", "message", "postback"]);
    const [m1, echo, story, pb] = events;
    expect(m1).toMatchObject({ externalId: "ig-message:m1", platformAccountId: "178414", from: { id: "9001" }, echo: false, storyReply: false });
    // An echo is the account talking: account is the sender, the person is the recipient.
    expect(echo).toMatchObject({ externalId: "ig-message:m2", platformAccountId: "178414", from: { id: "9001" }, echo: true });
    expect(story).toMatchObject({ storyReply: true, from: { id: "9002" } });
    expect(pb).toMatchObject({ kind: "postback", externalId: "ig-postback:m4", payload: "step:2", title: "Yes", from: { id: "9001" } });
    expect((m1 as { occurredAt: Date }).occurredAt.getTime()).toBe(1755600001000);
  });

  it("ignores other objects, unknown fields, and malformed entries", () => {
    expect(parseInstagramWebhook({ object: "page", entry: [{ id: "1", changes: [{ field: "feed", value: {} }] }] })).toEqual([]);
    expect(parseInstagramWebhook({ object: "instagram", entry: [{ id: "1", changes: [{ field: "mentions", value: { id: "x" } }] }] })).toEqual([]);
    expect(parseInstagramWebhook({ object: "instagram", entry: [{ changes: [{ field: "comments", value: { id: "c", from: { id: "f" } } }] }] })).toEqual([]);
    expect(parseInstagramWebhook(null)).toEqual([]);
    expect(parseInstagramWebhook("nope")).toEqual([]);
  });
});
