import type { Metadata } from "next";

import { ButtonLink } from "@/components/ui";

import { Pane, PaneRow } from "../pane";

export const metadata: Metadata = { title: "Get help · MarkedFox" };

// Real destinations only. A "Join the community" row pointing at a community
// that does not exist yet is exactly the dead control the rest of this
// redesign removed, so it is not here until there is somewhere for it to go.
export default function HelpPane() {
  return (
    <Pane
      title="Get help"
      blurb="Most questions are about connecting an account, because every platform words its permissions differently."
    >
      <PaneRow
        title="Email support"
        detail="support@markedfox.com. Say which platform and what it said — the platform's own error message is usually the whole answer."
        action={
          <ButtonLink href="mailto:support@markedfox.com" tone="primary" size="sm">
            Email us
          </ButtonLink>
        }
      />
      <PaneRow
        title="Why did my post fail?"
        detail="The calendar shows the outcome per platform on the post itself, including the platform's own reason."
        action={
          <ButtonLink href="/dashboard/calendar" size="sm">
            Open the calendar
          </ButtonLink>
        }
      />
      <PaneRow
        title="Why is a platform asking me to reconnect?"
        detail="A token was revoked or expired — usually a password change on that platform. Reconnecting takes one press."
        action={
          <ButtonLink href="/dashboard/settings/accounts" size="sm">
            Connected accounts
          </ButtonLink>
        }
      />
    </Pane>
  );
}
