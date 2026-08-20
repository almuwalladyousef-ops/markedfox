import { createHmac, timingSafeEqual } from "node:crypto";

import type { InboundEvent } from "./types";

// Meta's webhook delivery for the `instagram` object: signature check and
// normalisation into InboundEvents. Pure — the route hands in the raw body
// and the header; tests hand in fixtures.
//
// One webhook for the whole app (Meta's design): every tenant's events
// arrive here, and `entry[].id` (the IG user id) is how they are fanned out
// to the right connection afterwards.

// X-Hub-Signature-256: "sha256=<hex hmac of the RAW body with the app secret>".
// Must be computed over the bytes as received — re-serialised JSON differs.
export function verifyMetaSignature(rawBody: string, header: string | null, secret: string): boolean {
  if (!header || !header.startsWith("sha256=")) return false;
  const given = Buffer.from(header.slice("sha256=".length), "hex");
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest();
  return given.length === expected.length && timingSafeEqual(given, expected);
}

type Entry = {
  id?: string;
  time?: number;
  changes?: { field?: string; value?: Record<string, unknown> }[];
  messaging?: Record<string, unknown>[];
};

function str(v: unknown): string | undefined {
  return typeof v === "string" && v ? v : undefined;
}

function when(seconds: number | undefined, fallback: Date): Date {
  if (typeof seconds !== "number") return fallback;
  // Meta sends `time` in seconds on entries and `timestamp` in ms on messaging.
  return new Date(seconds > 1e12 ? seconds : seconds * 1000);
}

// Everything usable in one delivery. Unknown fields are skipped, not fatal:
// Meta adds fields over time and a new one must not stop comments flowing.
export function parseInstagramWebhook(body: unknown, now: Date = new Date()): InboundEvent[] {
  if (typeof body !== "object" || body === null) return [];
  const root = body as { object?: string; entry?: Entry[] };
  if (root.object !== "instagram" || !Array.isArray(root.entry)) return [];

  const events: InboundEvent[] = [];
  for (const entry of root.entry) {
    const accountId = str(entry.id);
    if (!accountId) continue;
    const entryTime = when(entry.time, now);

    for (const change of entry.changes ?? []) {
      if (change.field !== "comments" || !change.value) continue;
      const v = change.value;
      const id = str(v.id);
      const from = (typeof v.from === "object" && v.from !== null ? v.from : {}) as Record<string, unknown>;
      const fromId = str(from.id);
      if (!id || !fromId) continue;
      const media = (typeof v.media === "object" && v.media !== null ? v.media : {}) as Record<string, unknown>;
      events.push({
        kind: "comment",
        platform: "instagram",
        externalId: `ig-comment:${id}`,
        platformAccountId: accountId,
        from: { id: fromId, username: str(from.username) },
        text: str(v.text) ?? "",
        mediaId: str(media.id),
        parentCommentId: str(v.parent_id),
        occurredAt: entryTime,
      });
    }

    for (const m of entry.messaging ?? []) {
      const sender = (typeof m.sender === "object" && m.sender !== null ? m.sender : {}) as Record<string, unknown>;
      const recipient = (typeof m.recipient === "object" && m.recipient !== null ? m.recipient : {}) as Record<string, unknown>;
      const senderId = str(sender.id);
      const recipientId = str(recipient.id);
      if (!senderId || !recipientId) continue;
      const at = when(typeof m.timestamp === "number" ? m.timestamp : undefined, entryTime);

      if (typeof m.message === "object" && m.message !== null) {
        const msg = m.message as Record<string, unknown>;
        const mid = str(msg.mid);
        if (!mid) continue;
        const echo = msg.is_echo === true;
        const replyTo = (typeof msg.reply_to === "object" && msg.reply_to !== null ? msg.reply_to : {}) as Record<string, unknown>;
        // For an echo the account is the sender; otherwise the recipient.
        const accountIdForMessage = echo ? senderId : recipientId;
        events.push({
          kind: "message",
          platform: "instagram",
          externalId: `ig-message:${mid}`,
          platformAccountId: accountIdForMessage,
          from: { id: echo ? recipientId : senderId },
          text: str(msg.text) ?? "",
          storyReply: typeof replyTo.story === "object" && replyTo.story !== null,
          echo,
          occurredAt: at,
        });
        continue;
      }

      if (typeof m.postback === "object" && m.postback !== null) {
        const pb = m.postback as Record<string, unknown>;
        const mid = str(pb.mid) ?? `${senderId}:${at.getTime()}`;
        events.push({
          kind: "postback",
          platform: "instagram",
          externalId: `ig-postback:${mid}`,
          platformAccountId: recipientId,
          from: { id: senderId },
          payload: str(pb.payload) ?? "",
          title: str(pb.title),
          occurredAt: at,
        });
      }
    }
  }
  return events;
}
