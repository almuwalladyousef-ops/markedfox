import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TikTokOptionsPanel, type ContextState } from "./tiktok-options-panel";

// Server-render the panel and read the markup: what TikTok's reviewer sees.

const ready = (over: Partial<Extract<ContextState, { status: "ready" }>["context"]> = {}): ContextState => ({
  status: "ready",
  context: {
    creatorUsername: "markedfox",
    creatorNickname: "MarkedFox",
    privacyLevelOptions: ["PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS", "SELF_ONLY"],
    commentDisabled: false,
    duetDisabled: true,
    stitchDisabled: false,
    maxVideoPostDurationSec: 600,
    ...over,
  },
});

function render(props: Partial<Parameters<typeof TikTokOptionsPanel>[0]> = {}) {
  return renderToStaticMarkup(
    <TikTokOptionsPanel
      accounts={[{ id: "c1", name: "tiktok-acct" }]}
      contexts={{ c1: ready() }}
      options={{}}
      onChange={() => {}}
      hasVideo
      {...props}
    />,
  );
}

describe("TikTokOptionsPanel", () => {
  it("shows who the post goes to, by nickname and username", () => {
    const html = render();
    expect(html).toContain("Posting to");
    expect(html).toContain("MarkedFox");
    expect(html).toContain("@markedfox");
  });

  it("offers only the creator's privacy levels, with no preselected value", () => {
    const html = render();
    expect(html).toMatch(/<option value="" selected="">Choose…<\/option>/);
    expect(html).toContain('value="PUBLIC_TO_EVERYONE"');
    expect(html).toContain('value="SELF_ONLY"');
    expect(html).not.toContain('value="FOLLOWER_OF_CREATOR"');
  });

  it("offers only the intersection when two creators are selected", () => {
    const html = render({
      accounts: [
        { id: "c1", name: "a" },
        { id: "c2", name: "b" },
      ],
      contexts: { c1: ready(), c2: ready({ privacyLevelOptions: ["SELF_ONLY"] }) },
    });
    expect(html).toContain('value="SELF_ONLY"');
    expect(html).not.toContain('value="PUBLIC_TO_EVERYONE"');
  });

  it("greys out interactions the creator has disabled and hides duet/stitch for photos", () => {
    const html = render();
    // duet disabled in the fixture → its checkbox is disabled
    expect(html).toMatch(/<input type="checkbox"[^>]*disabled=""[^>]*\/>Duet/);
    expect(html).toMatch(/Comment/);
    const photo = render({ hasVideo: false });
    expect(photo).not.toContain("Duet");
    expect(photo).not.toContain("Stitch");
  });

  it("keeps the privacy select disabled until every creator's context has loaded", () => {
    const html = render({ contexts: { c1: { status: "loading" } } });
    expect(html).toMatch(/<select[^>]*disabled=""/);
    expect(html).toContain("Loading account details…");
  });

  it("reveals the brand choices when disclosure is on and names the label TikTok applies", () => {
    const off = render();
    expect(off).not.toContain("Your brand");
    const on = render({ options: { disclose_commercial: true, brand_content: true } });
    expect(on).toContain("Your brand");
    expect(on).toContain("Branded content");
    expect(on).toContain("Paid partnership");
    // Branded content → "Only you" is not selectable.
    expect(on).toMatch(/<option[^>]*value="SELF_ONLY"[^>]*disabled=""/);
    expect(on).toContain("Branded Content Policy");
  });

  it("always carries the Music Usage Confirmation consent line", () => {
    expect(render()).toContain("Music Usage Confirmation");
    expect(render()).toContain("By posting, you agree to TikTok");
  });
});
