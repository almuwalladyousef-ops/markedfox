import { describe, expect, it } from "vitest";

import { parseYouTubeVideoId } from "./links";

describe("parseYouTubeVideoId", () => {
  it("reads a watch URL", () => {
    expect(parseYouTubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(
      "dQw4w9WgXcQ",
    );
  });

  it("reads a Short, which is the format research actually cares about", () => {
    expect(parseYouTubeVideoId("https://youtube.com/shorts/dQw4w9WgXcQ")).toBe(
      "dQw4w9WgXcQ",
    );
  });

  it("reads a youtu.be link", () => {
    expect(parseYouTubeVideoId("https://youtu.be/dQw4w9WgXcQ?t=42")).toBe(
      "dQw4w9WgXcQ",
    );
  });

  it("reads an embed URL", () => {
    expect(parseYouTubeVideoId("https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe(
      "dQw4w9WgXcQ",
    );
  });

  it("accepts a bare id", () => {
    expect(parseYouTubeVideoId("dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  it("survives extra query parameters", () => {
    expect(
      parseYouTubeVideoId("https://youtube.com/watch?list=PL123&v=dQw4w9WgXcQ&t=9"),
    ).toBe("dQw4w9WgXcQ");
  });

  it("is null for another platform, so the user is told rather than shown nothing", () => {
    expect(parseYouTubeVideoId("https://www.tiktok.com/@a/video/123")).toBeNull();
    expect(parseYouTubeVideoId("https://instagram.com/reel/abc/")).toBeNull();
  });

  it("is null for junk", () => {
    expect(parseYouTubeVideoId("")).toBeNull();
    expect(parseYouTubeVideoId("not a link")).toBeNull();
  });
});
