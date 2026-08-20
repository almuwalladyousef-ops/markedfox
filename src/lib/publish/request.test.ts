import { describe, expect, it } from "vitest";

import { MAX_MEDIA_ITEMS, parseCreatePostRequest } from "./request";

const WS = "11111111-1111-4111-8111-111111111111";
const C1 = "22222222-2222-4222-8222-222222222222";
const C2 = "33333333-3333-4333-8333-333333333333";
const NOW = new Date("2026-08-16T12:00:00Z");

const valid = () => ({
  workspaceId: WS,
  caption: "hello",
  media: [{ url: "https://cdn.example.com/a.jpg", type: "image" }],
  targetConnectionIds: [C1, C2],
});

const fields = (r: ReturnType<typeof parseCreatePostRequest>) =>
  r.ok ? [] : r.issues.map((i) => i.field);

describe("parseCreatePostRequest", () => {
  it("accepts a well-formed publish-now body", () => {
    const r = parseCreatePostRequest(valid(), NOW);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.scheduledFor).toBeNull();
      expect(r.value.targetConnectionIds).toEqual([C1, C2]);
      expect(r.value.media).toEqual([{ url: "https://cdn.example.com/a.jpg", type: "image" }]);
      expect(r.value.platformOverrides).toEqual({});
    }
  });

  it("rejects non-object bodies", () => {
    expect(fields(parseCreatePostRequest(null, NOW))).toEqual(["body"]);
    expect(fields(parseCreatePostRequest([], NOW))).toEqual(["body"]);
    expect(fields(parseCreatePostRequest("x", NOW))).toEqual(["body"]);
  });

  it("requires a workspace id and at least one target", () => {
    expect(fields(parseCreatePostRequest({ ...valid(), workspaceId: "nope" }, NOW))).toEqual([
      "workspaceId",
    ]);
    expect(
      fields(parseCreatePostRequest({ ...valid(), targetConnectionIds: [] }, NOW)),
    ).toEqual(["targetConnectionIds"]);
    expect(
      fields(parseCreatePostRequest({ ...valid(), targetConnectionIds: ["abc"] }, NOW)),
    ).toEqual(["targetConnectionIds", "targetConnectionIds"]);
  });

  it("dedupes targets", () => {
    const r = parseCreatePostRequest({ ...valid(), targetConnectionIds: [C1, C1] }, NOW);
    expect(r.ok && r.value.targetConnectionIds).toEqual([C1]);
  });

  it("checks media item shape", () => {
    expect(
      fields(parseCreatePostRequest({ ...valid(), media: [{ url: "https://x/y", type: "gif" }] }, NOW)),
    ).toEqual(["media[0].type"]);
    expect(
      fields(parseCreatePostRequest({ ...valid(), media: [{ type: "image" }] }, NOW)),
    ).toEqual(["media[0].url"]);
    expect(fields(parseCreatePostRequest({ ...valid(), media: "nope" }, NOW))).toEqual(["media"]);
    expect(
      fields(
        parseCreatePostRequest(
          {
            ...valid(),
            media: Array.from({ length: MAX_MEDIA_ITEMS + 1 }, () => ({ url: "https://x/y", type: "image" })),
          },
          NOW,
        ),
      ),
    ).toEqual(["media"]);
  });

  it("keeps only known platform overrides with string captions", () => {
    const r = parseCreatePostRequest(
      { ...valid(), platformOverrides: { threads: { caption: "short" }, facebook: {} } },
      NOW,
    );
    expect(r.ok && r.value.platformOverrides).toEqual({ threads: { caption: "short" } });

    expect(
      fields(parseCreatePostRequest({ ...valid(), platformOverrides: { myspace: { caption: "x" } } }, NOW)),
    ).toEqual(["platformOverrides.myspace"]);
    expect(
      fields(parseCreatePostRequest({ ...valid(), platformOverrides: { x: { caption: 3 } } }, NOW)),
    ).toEqual(["platformOverrides.x.caption"]);
  });

  it("parses schedule times: future ok, near-now collapses to now, past refused, >1y refused", () => {
    const future = new Date(NOW.getTime() + 3600_000).toISOString();
    const r = parseCreatePostRequest({ ...valid(), scheduledFor: future }, NOW);
    expect(r.ok && r.value.scheduledFor?.toISOString()).toBe(future);

    const nearly = new Date(NOW.getTime() - 10_000).toISOString();
    const r2 = parseCreatePostRequest({ ...valid(), scheduledFor: nearly }, NOW);
    expect(r2.ok && r2.value.scheduledFor).toBeNull();

    const past = new Date(NOW.getTime() - 3600_000).toISOString();
    expect(fields(parseCreatePostRequest({ ...valid(), scheduledFor: past }, NOW))).toEqual([
      "scheduledFor",
    ]);

    const far = new Date(NOW.getTime() + 400 * 86400_000).toISOString();
    expect(fields(parseCreatePostRequest({ ...valid(), scheduledFor: far }, NOW))).toEqual([
      "scheduledFor",
    ]);

    expect(fields(parseCreatePostRequest({ ...valid(), scheduledFor: "tomorrow" }, NOW))).toEqual([
      "scheduledFor",
    ]);
    // Empty string from a form = publish now.
    const r3 = parseCreatePostRequest({ ...valid(), scheduledFor: "" }, NOW);
    expect(r3.ok && r3.value.scheduledFor).toBeNull();
  });

  it("reports every problem at once", () => {
    const r = parseCreatePostRequest(
      { workspaceId: 1, caption: 2, media: 3, targetConnectionIds: 4, scheduledFor: 5 },
      NOW,
    );
    expect(fields(r).sort()).toEqual(
      ["caption", "media", "scheduledFor", "targetConnectionIds", "workspaceId"].sort(),
    );
  });

  it("parses per-platform options and refuses malformed ones", () => {
    const ok = parseCreatePostRequest(
      {
        ...valid(),
        platformOverrides: {
          tiktok: { options: { privacy_level: "SELF_ONLY", allow_comment: true, n: 1 } },
          threads: { caption: "t" },
        },
      },
      NOW,
    );
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.value.platformOverrides.tiktok).toEqual({
        options: { privacy_level: "SELF_ONLY", allow_comment: true, n: 1 },
      });
      expect(ok.value.platformOverrides.threads).toEqual({ caption: "t" });
    }

    for (const bad of [
      { nested: { deep: true } },
      { "Bad Key": 1 },
      ["a"],
      "str",
      { s: "x".repeat(201) },
      Object.fromEntries(Array.from({ length: 25 }, (_, i) => [`k${i}`, true])),
    ]) {
      expect(
        fields(parseCreatePostRequest({ ...valid(), platformOverrides: { tiktok: { options: bad } } }, NOW)),
      ).toEqual(["platformOverrides.tiktok.options"]);
    }
  });
});

describe("drafts", () => {
  it("accepts one with no targets at all", () => {
    // Half a post is exactly what a draft is; refusing to save one because no
    // account is chosen yet is how people lose work.
    const parsed = parseCreatePostRequest(
      { workspaceId: WS, draft: true, caption: "half an idea" },
      NOW,
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.draft).toBe(true);
    expect(parsed.value.targetConnectionIds).toEqual([]);
  });

  it("still demands targets for a real post", () => {
    const parsed = parseCreatePostRequest(
      { workspaceId: WS, caption: "going out" },
      NOW,
    );
    expect(parsed.ok).toBe(false);
  });

  it("keeps a time already in the past on a draft, and refuses it on a post", () => {
    const past = new Date(NOW.getTime() - 60 * 60 * 1000).toISOString();

    const asDraft = parseCreatePostRequest(
      { workspaceId: WS, draft: true, scheduledFor: past },
      NOW,
    );
    expect(asDraft.ok).toBe(true);
    // Silently clearing it would lose something the user typed.
    if (asDraft.ok) expect(asDraft.value.scheduledFor?.toISOString()).toBe(past);

    const asPost = parseCreatePostRequest(
      { ...valid(), scheduledFor: past },
      NOW,
    );
    expect(asPost.ok).toBe(false);
  });

  it("refuses a draftId that is not an id", () => {
    const parsed = parseCreatePostRequest(
      { workspaceId: WS, draft: true, draftId: "nope" },
      NOW,
    );
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.issues.map((i) => i.field)).toContain("draftId");
  });
});
