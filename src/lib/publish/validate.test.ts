import { describe, expect, it } from "vitest";

import { getPlatform } from "@/lib/platforms/registry";
import type { MediaRef } from "@/lib/platforms/types";

import {
  captionLength,
  hashtagCount,
  validateContent,
  validateForTargets,
  type PlatformContentSpec,
} from "./validate";

const spec = (id: "instagram" | "facebook" | "threads"): PlatformContentSpec => {
  const a = getPlatform(id);
  return {
    id: a.id,
    displayName: a.displayName,
    capabilities: a.capabilities,
    rules: a.rules,
  };
};

const image = (n = 1): MediaRef[] =>
  Array.from({ length: n }, (_, i) => ({
    url: `https://cdn.example.com/${i}.jpg`,
    type: "image" as const,
  }));
const video = (n = 1): MediaRef[] =>
  Array.from({ length: n }, (_, i) => ({
    url: `https://cdn.example.com/${i}.mp4`,
    type: "video" as const,
  }));

const codes = (issues: { code: string }[]) => issues.map((i) => i.code);

describe("captionLength / hashtagCount", () => {
  it("counts code points so an emoji is one character", () => {
    expect(captionLength("hi 👋")).toBe(4);
    expect(captionLength("")).toBe(0);
  });
  it("counts hashtags at word boundaries only", () => {
    expect(hashtagCount("#one #two three#four\n#five")).toBe(3);
    expect(hashtagCount("no tags")).toBe(0);
  });
});

describe("validateContent", () => {
  it("refuses an empty post on every platform", () => {
    for (const id of ["instagram", "facebook", "threads"] as const) {
      expect(codes(validateContent(spec(id), { caption: "  ", media: [] }))).toEqual([
        "nothing_to_post",
      ]);
    }
  });

  it("Instagram: text-only is refused, media makes it valid", () => {
    expect(
      codes(validateContent(spec("instagram"), { caption: "hello", media: [] })),
    ).toEqual(["text_only_unsupported"]);
    expect(
      validateContent(spec("instagram"), { caption: "hello", media: image() }),
    ).toEqual([]);
  });

  it("Instagram: 2,200-character caption and 30-hashtag limits", () => {
    const ok = "x".repeat(2200);
    expect(
      validateContent(spec("instagram"), { caption: ok, media: image() }),
    ).toEqual([]);
    expect(
      codes(validateContent(spec("instagram"), { caption: ok + "x", media: image() })),
    ).toEqual(["caption_too_long"]);

    const tags = Array.from({ length: 31 }, (_, i) => `#t${i}`).join(" ");
    expect(
      codes(validateContent(spec("instagram"), { caption: tags, media: image() })),
    ).toEqual(["too_many_hashtags"]);
  });

  it("Instagram: carousel of up to 10 mixed items, 11 refused", () => {
    expect(
      validateContent(spec("instagram"), {
        caption: "",
        media: [...image(5), ...video(5)],
      }),
    ).toEqual([]);
    expect(
      codes(validateContent(spec("instagram"), { caption: "", media: image(11) })),
    ).toEqual(["too_many_media"]);
  });

  it("Facebook: text-only fine, one video max, no mixing", () => {
    expect(validateContent(spec("facebook"), { caption: "hi", media: [] })).toEqual([]);
    expect(
      codes(validateContent(spec("facebook"), { caption: "", media: video(2) })),
    ).toEqual(["too_many_videos"]);
    expect(
      codes(
        validateContent(spec("facebook"), {
          caption: "",
          media: [...image(1), ...video(1)],
        }),
      ),
    ).toEqual(["mixed_media"]);
  });

  it("Threads: 500 characters, up to 20 items", () => {
    expect(
      validateContent(spec("threads"), { caption: "x".repeat(500), media: [] }),
    ).toEqual([]);
    expect(
      codes(validateContent(spec("threads"), { caption: "x".repeat(501), media: [] })),
    ).toEqual(["caption_too_long"]);
    expect(validateContent(spec("threads"), { caption: "", media: image(20) })).toEqual(
      [],
    );
    expect(
      codes(validateContent(spec("threads"), { caption: "", media: image(21) })),
    ).toEqual(["too_many_media"]);
  });

  it("rejects media that is not a public http(s) URL", () => {
    expect(
      codes(
        validateContent(spec("threads"), {
          caption: "",
          media: [{ url: "data:image/png;base64,AAAA", type: "image" }],
        }),
      ),
    ).toEqual(["invalid_media_url"]);
    expect(
      codes(
        validateContent(spec("threads"), {
          caption: "",
          media: [{ url: "/uploads/a.jpg", type: "image" }],
        }),
      ),
    ).toEqual(["invalid_media_url"]);
  });

  it("refuses several items on a platform without carousels", () => {
    const single: PlatformContentSpec = {
      ...spec("threads"),
      id: "x",
      displayName: "X",
      capabilities: { ...spec("threads").capabilities, carousel: false },
    };
    expect(codes(validateContent(single, { caption: "", media: image(2) }))).toEqual([
      "too_many_media",
    ]);
  });
});

describe("validateForTargets", () => {
  it("applies per-platform caption overrides before checking", () => {
    const long = "x".repeat(600);
    // Shared caption breaks Threads; an override for Threads fixes only Threads.
    const issues = validateForTargets(
      [spec("facebook"), spec("threads")],
      { caption: long, media: [] },
      { threads: { caption: "short" } },
    );
    expect(issues).toEqual([]);

    const without = validateForTargets(
      [spec("facebook"), spec("threads")],
      { caption: long, media: [] },
    );
    expect(without.map((i) => [i.platform, i.code])).toEqual([
      ["threads", "caption_too_long"],
    ]);
  });
});
