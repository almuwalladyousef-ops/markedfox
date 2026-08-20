import { describe, expect, it } from "vitest";

import {
  extractJson,
  HOOK_TYPES,
  parseBreakdown,
  summariseBreakdown,
  type Breakdown,
} from "./breakdown";
import {
  buildAuditPrompt,
  buildBreakdownPrompt,
  buildHookPrompt,
  renderBreakdownForPrompt,
} from "./breakdown-prompt";

const FULL = JSON.stringify({
  hook: "Everyone tells you to grind. That is why you are broke.",
  hook_type: "contradiction",
  curiosity_loop: "Names a mistake but withholds the fix until 0:38",
  structure: [
    { label: "hook", detail: "Contradicts common advice" },
    { label: "turn", detail: "Reveals the real cause" },
    { label: "payoff", detail: "Gives the fix in one line" },
  ],
  format_notes: "Talking head, hard cuts every 2s, captions burned in",
  takeaway: "Open by contradicting the advice the audience already believes",
  notes: "No CTA at all",
});

describe("parseBreakdown", () => {
  it("reads a clean JSON answer", () => {
    const breakdown = parseBreakdown(FULL);
    expect(breakdown?.hookType).toBe("contradiction");
    expect(breakdown?.structure).toHaveLength(3);
    expect(breakdown?.structure[0].label).toBe("hook");
  });

  it("reads JSON out of a fenced code block", () => {
    expect(parseBreakdown("```json\n" + FULL + "\n```")?.hook).toContain("grind");
  });

  it("reads JSON out of a chatty answer, rather than wasting the credit", () => {
    const breakdown = parseBreakdown(`Here's the breakdown:\n\n${FULL}\n\nHope that helps!`);
    expect(breakdown?.takeaway).toContain("contradicting");
  });

  it("accepts beats returned as plain strings", () => {
    // A correct answer in the wrong shape is still a correct answer.
    const breakdown = parseBreakdown(
      JSON.stringify({ hook: "x", structure: ["opens cold", "pays off late"] }),
    );
    expect(breakdown?.structure.map((b) => b.detail)).toEqual([
      "opens cold",
      "pays off late",
    ]);
  });

  it("normalises a hook type the model wrote loosely", () => {
    expect(
      parseBreakdown(JSON.stringify({ hook: "x", hook_type: "Open Loop" }))?.hookType,
    ).toBe("open_loop");
  });

  it("drops a hook type that is not one of ours rather than inventing a category", () => {
    expect(
      parseBreakdown(JSON.stringify({ hook: "x", hook_type: "vibes" }))?.hookType,
    ).toBeNull();
  });

  it("is null for prose, so the user is told to retry instead of shown blanks", () => {
    expect(parseBreakdown("The video was pretty good honestly.")).toBeNull();
  });

  it("is null for an object with nothing usable in it", () => {
    // Empty fields would read as 'this video had no structure'.
    expect(parseBreakdown(JSON.stringify({ notes: "n/a" }))).toBeNull();
  });

  it("is null for malformed JSON", () => {
    expect(parseBreakdown("{ hook: unquoted }")).toBeNull();
  });
});

describe("extractJson", () => {
  it("returns null when there is no object at all", () => {
    expect(extractJson("no braces here")).toBeNull();
  });

  it("takes the outermost object", () => {
    expect(extractJson('prefix {"a":{"b":1}} suffix')).toBe('{"a":{"b":1}}');
  });
});

describe("buildBreakdownPrompt", () => {
  const subject = { title: "I quit my job", platform: "youtube" };

  it("demands the hook verbatim, because the exact wording is what worked", () => {
    expect(buildBreakdownPrompt(subject)).toContain("VERBATIM");
  });

  it("tells the model to say unknown rather than guess", () => {
    // The user can go and watch this video; an invented detail is fatal.
    expect(buildBreakdownPrompt(subject)).toContain('"unknown"');
  });

  it("says so explicitly when there is no transcript", () => {
    expect(buildBreakdownPrompt(subject)).toContain("No transcript is available");
  });

  it("includes the transcript when there is one", () => {
    const prompt = buildBreakdownPrompt({ ...subject, transcript: "hello there" });
    expect(prompt).toContain("hello there");
    expect(prompt).not.toContain("No transcript is available");
  });

  it("offers the model only our named hook types", () => {
    const prompt = buildBreakdownPrompt(subject);
    for (const type of HOOK_TYPES) expect(prompt).toContain(type);
  });
});

describe("renderBreakdownForPrompt", () => {
  const breakdown = parseBreakdown(FULL) as Breakdown;

  it("passes the mechanism", () => {
    const rendered = renderBreakdownForPrompt(breakdown);
    expect(rendered).toContain("contradiction");
    expect(rendered).toContain("Reveals the real cause");
  });

  it("never passes the original hook wording", () => {
    // This is what makes the output a remix rather than a paraphrase: there is
    // nothing there to copy.
    expect(renderBreakdownForPrompt(breakdown)).not.toContain("That is why you are broke");
  });

  it("says the structure carries over and the wording does not", () => {
    expect(renderBreakdownForPrompt(breakdown)).toContain("Do not reuse the original wording");
  });
});

describe("buildHookPrompt", () => {
  it("asks for a bounded count", () => {
    expect(buildHookPrompt({ topic: "espresso", count: 500 })).toContain("Write 30 hooks");
    expect(buildHookPrompt({ topic: "espresso", count: 1 })).toContain("Write 5 hooks");
  });

  it("defaults to twenty", () => {
    expect(buildHookPrompt({ topic: "espresso" })).toContain("Write 20 hooks");
  });

  it("folds in a breakdown when there is one", () => {
    const breakdown = parseBreakdown(FULL) as Breakdown;
    expect(buildHookPrompt({ topic: "espresso", breakdown })).toContain("contradiction");
  });
});

describe("buildAuditPrompt", () => {
  const input = {
    channelTitle: "My channel",
    platform: "youtube",
    baselineViews: 4200,
    sample: 20,
    top: [{ title: "The good one", score: 9.1 }],
    bottom: [{ title: "The flop", score: 0.2 }],
  };

  it("forbids comparing the creator to anyone else", () => {
    // Only this account's own evidence transfers to this account.
    expect(buildAuditPrompt(input)).toContain("Do not compare them to other creators");
  });

  it("includes both ends, because the flops carry as much signal", () => {
    const prompt = buildAuditPrompt(input);
    expect(prompt).toContain("The good one");
    expect(prompt).toContain("The flop");
  });

  it("admits when the baseline is too thin to lean on", () => {
    const prompt = buildAuditPrompt({ ...input, baselineViews: null, sample: 3 });
    expect(prompt).toContain("Not enough videos yet");
  });
});

describe("summariseBreakdown", () => {
  it("prefers the takeaway", () => {
    expect(summariseBreakdown(parseBreakdown(FULL) as Breakdown)).toContain(
      "contradicting",
    );
  });

  it("falls back to the hook pattern", () => {
    const breakdown = parseBreakdown(
      JSON.stringify({ hook: "x", hook_type: "stakes" }),
    ) as Breakdown;
    expect(summariseBreakdown(breakdown)).toContain("Stakes");
  });
});
