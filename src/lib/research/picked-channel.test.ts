import { describe, expect, it } from "vitest";

import { parseChannelSuggestions, parsePickedChannel } from "./discover";

describe("parseChannelSuggestions", () => {
  it("keeps the name so the exact lookup can be used", () => {
    // Without a handle to look up exactly, YouTube's parser treats it as free
    // text and the 1-unit exact lookup becomes a 100-unit fuzzy search that
    // matches essentially any string.
    const groups = parseChannelSuggestions("## X\n@marketingharry\nplainname");
    expect(groups[0].handles).toEqual(["marketingharry", "plainname"]);
  });
});

describe("parsePickedChannel", () => {
  const pack = (over: Record<string, unknown> = {}) =>
    JSON.stringify({
      platform: "youtube",
      externalId: "UC123",
      handle: "@alex",
      title: "Alex Hormozi | Acquisition.com",
      thumbnailUrl: "https://cdn.example.com/a.jpg",
      followerCount: 1_200_000,
      ...over,
    });

  it("survives a pipe in the title", () => {
    // The delimited version of this shredded the title into three fields and
    // put the thumbnail URL in the follower count.
    const picked = parsePickedChannel(pack());
    expect(picked).toEqual({
      platform: "youtube",
      externalId: "UC123",
      handle: "@alex",
      title: "Alex Hormozi | Acquisition.com",
      thumbnailUrl: "https://cdn.example.com/a.jpg",
      followerCount: 1_200_000,
    });
  });

  it("carries the platform per pick", () => {
    expect(parsePickedChannel(pack({ platform: "instagram" }))?.platform).toBe(
      "instagram",
    );
  });

  it("refuses a platform research cannot read", () => {
    expect(parsePickedChannel(pack({ platform: "snapchat" }))).toBeNull();
  });

  it("refuses a candidate with no id, and rubbish JSON", () => {
    expect(parsePickedChannel(pack({ externalId: "" }))).toBeNull();
    expect(parsePickedChannel("not json")).toBeNull();
    expect(parsePickedChannel("[1,2]")).toBeNull();
  });

  it("drops a thumbnail that is not an http URL", () => {
    expect(
      parsePickedChannel(pack({ thumbnailUrl: "javascript:alert(1)" }))
        ?.thumbnailUrl,
    ).toBeNull();
  });

  it("drops a follower count that is not a number", () => {
    expect(parsePickedChannel(pack({ followerCount: "lots" }))?.followerCount).toBeNull();
    expect(parsePickedChannel(pack({ followerCount: -5 }))?.followerCount).toBeNull();
  });

  it("falls back to the id when there is no title", () => {
    expect(parsePickedChannel(pack({ title: 42 }))?.title).toBe("UC123");
  });
});
