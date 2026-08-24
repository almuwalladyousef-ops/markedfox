import { describe, expect, it } from "vitest";

import {
  NO_EDIT,
  buildFfmpegArgs,
  clampEdit,
  formatSeconds,
  hasEdits,
  outputNameFor,
  trimmedDuration,
  type MediaEdit,
} from "./edit";

const edit = (over: Partial<MediaEdit> = {}): MediaEdit => ({
  ...NO_EDIT,
  ...over,
});

describe("hasEdits", () => {
  it("is false for an untouched clip, so it never pays for ffmpeg", () => {
    expect(hasEdits(NO_EDIT, 30)).toBe(false);
    expect(hasEdits(edit({ endSec: 30 }), 30)).toBe(false);
  });

  it("ignores a nudge too small to be a request", () => {
    expect(hasEdits(edit({ startSec: 0.03 }), 30)).toBe(false);
    expect(hasEdits(edit({ endSec: 29.97 }), 30)).toBe(false);
    expect(hasEdits(edit({ volume: 0.998 }), 30)).toBe(false);
  });

  it("catches each edit on its own", () => {
    expect(hasEdits(edit({ startSec: 2 }), 30)).toBe(true);
    expect(hasEdits(edit({ endSec: 20 }), 30)).toBe(true);
    expect(hasEdits(edit({ volume: 0.5 }), 30)).toBe(true);
    expect(hasEdits(edit({ volume: 0 }), 30)).toBe(true);
  });

  it("trusts an explicit end when the duration is not known yet", () => {
    expect(hasEdits(edit({ endSec: 12 }), 0)).toBe(true);
    expect(hasEdits(edit({ endSec: 12 }), Number.NaN)).toBe(true);
  });
});

describe("clampEdit", () => {
  it("keeps the handles inside the clip and in order", () => {
    expect(clampEdit(edit({ startSec: -4, endSec: 99 }), 30)).toEqual({
      startSec: 0,
      endSec: 30,
      volume: 1,
    });
    // An end dragged past the start collapses onto it rather than inverting.
    expect(clampEdit(edit({ startSec: 20, endSec: 5 }), 30).endSec).toBe(20);
  });

  it("never lets the volume be boosted above the source", () => {
    expect(clampEdit(edit({ volume: 4 }), 30).volume).toBe(1);
    expect(clampEdit(edit({ volume: -1 }), 30).volume).toBe(0);
  });
});

describe("buildFfmpegArgs", () => {
  it("copies both streams when only the head is trimmed", () => {
    const args = buildFfmpegArgs(edit({ startSec: 3 }), "in.mp4", "out.mp4", 30);
    expect(args).toEqual([
      "-ss",
      "3.000",
      "-i",
      "in.mp4",
      "-c:v",
      "copy",
      "-c:a",
      "copy",
      "-movflags",
      "+faststart",
      "out.mp4",
    ]);
  });

  it("seeks before -i, so the decode is skipped rather than discarded", () => {
    const args = buildFfmpegArgs(edit({ startSec: 5 }), "in.mp4", "o.mp4", 30);
    expect(args.indexOf("-ss")).toBeLessThan(args.indexOf("-i"));
  });

  it("expresses the tail as a duration, since -ss already moved the clock", () => {
    const args = buildFfmpegArgs(
      edit({ startSec: 4, endSec: 10 }),
      "in.mp4",
      "o.mp4",
      30,
    );
    expect(args).toContain("-t");
    expect(args[args.indexOf("-t") + 1]).toBe("6.000");
    expect(args).not.toContain("-to");
  });

  it("leaves the tail alone when the end is the end", () => {
    const args = buildFfmpegArgs(
      edit({ startSec: 2, endSec: 30 }),
      "in.mp4",
      "o.mp4",
      30,
    );
    expect(args).not.toContain("-t");
  });

  it("re-encodes audio only for a volume change, and never the video", () => {
    const quiet = buildFfmpegArgs(edit({ volume: 0.4 }), "in.mp4", "o.mp4", 30);
    expect(quiet).toContain("-af");
    expect(quiet[quiet.indexOf("-af") + 1]).toBe("volume=0.400");
    expect(quiet[quiet.indexOf("-c:a") + 1]).toBe("aac");
    // The picture is never touched, whatever else is asked for.
    expect(quiet[quiet.indexOf("-c:v") + 1]).toBe("copy");
  });

  it("mutes with volume=0 rather than dropping the track", () => {
    const args = buildFfmpegArgs(edit({ volume: 0 }), "in.mp4", "o.mp4", 30);
    expect(args[args.indexOf("-af") + 1]).toBe("volume=0.000");
    expect(args).not.toContain("-an");
  });

  it("always moves the index to the front", () => {
    const args = buildFfmpegArgs(edit({ startSec: 1 }), "in.mp4", "o.mp4", 30);
    expect(args[args.indexOf("-movflags") + 1]).toBe("+faststart");
    expect(args[args.length - 1]).toBe("o.mp4");
  });
});

describe("trimmedDuration", () => {
  it("measures the piece that survives", () => {
    expect(trimmedDuration(edit({ startSec: 4, endSec: 10 }), 30)).toBe(6);
    expect(trimmedDuration(edit({ startSec: 4 }), 30)).toBe(26);
    expect(trimmedDuration(edit(), Number.NaN)).toBeNull();
  });
});

describe("outputNameFor", () => {
  it("always lands on mp4, whatever went in", () => {
    expect(outputNameFor("clip.mov")).toBe("clip-edited.mp4");
    expect(outputNameFor("holiday.MP4")).toBe("holiday-edited.mp4");
    expect(outputNameFor("no-extension")).toBe("no-extension-edited.mp4");
  });
});

describe("formatSeconds", () => {
  it("reads as a clock", () => {
    expect(formatSeconds(0)).toBe("0:00");
    expect(formatSeconds(9.6)).toBe("0:09");
    expect(formatSeconds(75)).toBe("1:15");
    expect(formatSeconds(Number.NaN)).toBe("0:00");
  });
});
