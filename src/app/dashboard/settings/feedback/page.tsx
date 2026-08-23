import type { Metadata } from "next";

import { ButtonLink } from "@/components/ui";

import { Pane, PaneRow } from "../pane";

export const metadata: Metadata = { title: "Send feedback · MarkedFox" };

export default function FeedbackPane() {
  return (
    <Pane
      title="Send feedback or ideas"
      blurb="MarkedFox is small enough that one email changes what gets built next."
    >
      <PaneRow
        title="Tell us what is missing"
        detail="What you tried to do, and what the app made you do instead."
        action={
          <ButtonLink
            href="mailto:hello@markedfox.com?subject=MarkedFox%20feedback"
            tone="primary"
            size="sm"
          >
            Write to us
          </ButtonLink>
        }
      />
      <PaneRow
        title="Report something broken"
        detail="Include the screen and roughly when it happened, so it can be found in the logs."
        action={
          <ButtonLink
            href="mailto:support@markedfox.com?subject=MarkedFox%20bug"
            size="sm"
          >
            Report a bug
          </ButtonLink>
        }
      />
    </Pane>
  );
}
