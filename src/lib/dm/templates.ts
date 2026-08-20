import type { RuleFormValues } from "./rule-form";

// Starters for the rule builder.
//
// A blank builder is the reason most automation tools go unused: the person
// knows what they want the automation to DO and has no idea which trigger and
// which steps express it. A template is that translation, already done, with
// the copy filled in so the first thing they see is a working rule rather than
// an empty form.
//
// Deliberately code rather than rows in a table. These are product decisions
// about what a good automation looks like — they ship with a release, they get
// edited in review, and none of them is worth a migration.

export type TemplateGoal = "followers" | "engagement" | "traffic" | "leads";

export interface RuleTemplate {
  id: string;
  name: string;
  /** One line, in the user's terms: what this does, not how. */
  description: string;
  goal: TemplateGoal;
  trigger: "comment" | "dm_keyword" | "story_reply";
  popular?: boolean;
  /** True when the template uses a step the plan may not include. */
  needsPaidStep?: boolean;
  /** Everything the builder should be pre-filled with. */
  values: Partial<RuleFormValues>;
}

export const GOAL_LABELS: Record<TemplateGoal, string> = {
  followers: "Grow your followers",
  engagement: "Engage your audience",
  traffic: "Drive traffic",
  leads: "Collect leads",
};

export const TRIGGER_LABELS: Record<RuleTemplate["trigger"], string> = {
  comment: "Post or reel comment",
  dm_keyword: "DM",
  story_reply: "Story reply",
};

// The opening DM matters more than anything else in these templates. Instagram
// will not let an automation send a link out of nowhere: the first message has
// to earn a reply, and the link goes in the second. Every template here is
// shaped by that, which is also why they convert.
export const RULE_TEMPLATES: RuleTemplate[] = [
  {
    id: "comment-to-link",
    name: "Auto-DM a link from comments",
    description: "Send a link when people comment a keyword on a post or reel.",
    goal: "traffic",
    trigger: "comment",
    popular: true,
    values: {
      name: "Auto-DM a link from comments",
      trigger: "comment",
      keywordMode: "keywords",
      keywords: "link",
      postScope: "any",
      dmText:
        "Hey! Thanks so much for your interest 😊\n\nTap below and I'll send the link straight over.",
      buttonTitle: "Send me the link",
      buttonUrl: "",
      commentReplyText: "Just sent it to your DMs 📩",
      oncePerContact: true,
    },
  },
  {
    id: "comment-nudge",
    name: "Send the link, then chase the people who ignored it",
    description:
      "The same link DM, plus a nudge a day later — only to people who never tapped.",
    goal: "traffic",
    trigger: "comment",
    values: {
      name: "Link, then a nudge",
      trigger: "comment",
      keywordMode: "keywords",
      keywords: "link, guide",
      dmText:
        "Here you go — tap below and it's yours 👇",
      buttonTitle: "Get the link",
      buttonUrl: "",
      followUps: [
        {
          text: "Did you get a chance to look? It only takes a couple of minutes.",
          delayMinutes: 24 * 60,
          skipIfClicked: true,
        },
      ],
      oncePerContact: true,
    },
  },
  {
    id: "collect-email",
    name: "Grow your email list",
    description:
      "Offer something in exchange for an email, and store the address on the contact.",
    goal: "leads",
    trigger: "comment",
    needsPaidStep: true,
    values: {
      name: "Freebie for an email",
      trigger: "comment",
      keywordMode: "keywords",
      keywords: "guide",
      dmText:
        "Happy to send it over! What's the best email to send it to?",
      followUps: [],
      oncePerContact: true,
    },
  },
  {
    id: "dm-faq",
    name: "Answer a question people keep asking",
    description: "Reply instantly when someone DMs a specific word.",
    goal: "engagement",
    trigger: "dm_keyword",
    values: {
      name: "FAQ reply",
      trigger: "dm_keyword",
      keywordMode: "keywords",
      keywords: "price, pricing, how much",
      dmText:
        "Great question — here's exactly how the pricing works, and what's included at each level.",
      oncePerContact: false,
    },
  },
  {
    id: "story-reply",
    name: "Reply to story replies",
    description: "Answer everyone who replies to a story with a keyword.",
    goal: "engagement",
    trigger: "story_reply",
    values: {
      name: "Story reply",
      trigger: "story_reply",
      keywordMode: "keywords",
      keywords: "yes, me",
      dmText: "You replied to the story — here's what I mentioned 👇",
      buttonTitle: "Take a look",
      buttonUrl: "",
      oncePerContact: false,
    },
  },
  {
    id: "giveaway",
    name: "Run a giveaway",
    description:
      "Confirm every entry publicly and in the DMs, so people know it counted.",
    goal: "followers",
    trigger: "comment",
    values: {
      name: "Giveaway entries",
      trigger: "comment",
      keywordMode: "keywords",
      keywords: "enter, me, in",
      commentReplyText: "You're in! Check your DMs 🎉",
      dmText:
        "You're entered 🎉 Winners are announced on Friday, right here in your DMs.",
      oncePerContact: true,
    },
  },
  {
    id: "comment-to-follow",
    name: "Ask for a follow before the freebie",
    description:
      "Ask people to follow, then send what they asked for. Instagram gives no way to check a follow, so this asks rather than enforces.",
    goal: "followers",
    trigger: "comment",
    values: {
      name: "Follow, then freebie",
      trigger: "comment",
      keywordMode: "keywords",
      keywords: "freebie",
      dmText:
        "It's yours! Make sure you're following so you don't miss the next one — then tap below 👇",
      buttonTitle: "I'm following",
      buttonUrl: "",
      oncePerContact: true,
    },
  },
  {
    id: "sell-from-comments",
    name: "Sell from a reel's comments",
    description:
      "When a reel takes off, answer every 'where is this from' with the actual link.",
    goal: "traffic",
    trigger: "comment",
    values: {
      name: "Where is this from",
      trigger: "comment",
      keywordMode: "keywords",
      keywords: "where, link, shop, price",
      dmText:
        "Here's the exact one from the video 👇",
      buttonTitle: "See it here",
      buttonUrl: "",
      oncePerContact: true,
    },
  },
];

export function getRuleTemplate(id: string): RuleTemplate | null {
  return RULE_TEMPLATES.find((template) => template.id === id) ?? null;
}
