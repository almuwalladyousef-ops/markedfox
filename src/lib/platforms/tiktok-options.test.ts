import { describe, expect, it } from "vitest";

import {
  parseCreatorContext,
  parseTikTokOptions,
  tiktokConsentText,
  validateTikTokOptions,
} from "./tiktok-options";

// What TikTok's Direct Post audit checks, as code: privacy must be chosen
// (never defaulted), interaction toggles obey creator_info, commercial
// disclosure needs a brand choice, and branded content cannot be private.

const context = parseCreatorContext({
  creator_username: "markedfox",
  creator_nickname: "MarkedFox",
  privacy_level_options: ["PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS", "SELF_ONLY"],
  comment_disabled: false,
  duet_disabled: true,
  stitch_disabled: false,
  max_video_post_duration_sec: 600,
});

describe("parseTikTokOptions", () => {
  it("keeps only known keys with the right types", () => {
    expect(
      parseTikTokOptions({
        privacy_level: "SELF_ONLY",
        allow_comment: true,
        allow_duet: "yes",
        brand_content: false,
        unknown: 1,
      }),
    ).toEqual({ privacy_level: "SELF_ONLY", allow_comment: true, brand_content: false });
    expect(parseTikTokOptions(null)).toEqual({});
    expect(parseTikTokOptions({ privacy_level: "" })).toEqual({});
  });
});

describe("validateTikTokOptions", () => {
  it("requires a privacy level — TikTok forbids a default", () => {
    expect(validateTikTokOptions({}, context)).toEqual(["Choose who can see this TikTok post."]);
  });

  it("refuses a privacy level the creator is not allowed", () => {
    expect(validateTikTokOptions({ privacy_level: "FOLLOWER_OF_CREATOR" }, context)[0]).toMatch(
      /does not allow "Followers"/,
    );
  });

  it("passes a chosen, allowed level with everything else off", () => {
    expect(validateTikTokOptions({ privacy_level: "SELF_ONLY" }, context)).toEqual([]);
  });

  it("needs a brand choice once disclosure is on", () => {
    expect(
      validateTikTokOptions({ privacy_level: "PUBLIC_TO_EVERYONE", disclose_commercial: true }, context),
    ).toEqual([expect.stringMatching(/Your brand.*Branded content/)]);
    expect(
      validateTikTokOptions(
        { privacy_level: "PUBLIC_TO_EVERYONE", disclose_commercial: true, brand_organic: true },
        context,
      ),
    ).toEqual([]);
  });

  it("forbids private branded content", () => {
    expect(
      validateTikTokOptions(
        { privacy_level: "SELF_ONLY", disclose_commercial: true, brand_content: true },
        context,
      ),
    ).toEqual([expect.stringMatching(/cannot be private/)]);
  });

  it("refuses to allow an interaction the creator has disabled", () => {
    expect(
      validateTikTokOptions({ privacy_level: "PUBLIC_TO_EVERYONE", allow_duet: true }, context),
    ).toEqual([expect.stringMatching(/duets turned off/)]);
    // Photo posts have no duet, so a stale allow_duet is not an issue there.
    expect(
      validateTikTokOptions({ privacy_level: "PUBLIC_TO_EVERYONE", allow_duet: true }, context, {
        hasVideo: false,
      }),
    ).toEqual([]);
  });

  it("validates without a context (server side at create time)", () => {
    expect(validateTikTokOptions({ privacy_level: "FOLLOWER_OF_CREATOR" })).toEqual([]);
    expect(validateTikTokOptions({})).toHaveLength(1);
  });
});

describe("tiktokConsentText", () => {
  it("names the Music Usage Confirmation, and the Branded Content Policy only when branded", () => {
    expect(tiktokConsentText({}).links.map((l) => l.label)).toEqual(["Music Usage Confirmation"]);
    expect(tiktokConsentText({ brand_content: true }).links.map((l) => l.label)).toEqual([
      "Branded Content Policy",
      "Music Usage Confirmation",
    ]);
  });
});

describe("post_mode", () => {
  it("keeps only the two known modes", () => {
    expect(parseTikTokOptions({ post_mode: "inbox" })).toEqual({ post_mode: "inbox" });
    expect(parseTikTokOptions({ post_mode: "direct" })).toEqual({ post_mode: "direct" });
    expect(parseTikTokOptions({ post_mode: "story" })).toEqual({});
  });

  it("asks nothing of a draft sent to the TikTok inbox", () => {
    expect(validateTikTokOptions({ post_mode: "inbox" }, context)).toEqual([]);
    // A direct post still has to choose who can see it.
    expect(validateTikTokOptions({ post_mode: "direct" }, context)).toContain(
      "Choose who can see this TikTok post.",
    );
  });
});
