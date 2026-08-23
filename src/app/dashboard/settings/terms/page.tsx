import type { Metadata } from "next";

import { ButtonLink } from "@/components/ui";

import { Pane, PaneRow } from "../pane";

export const metadata: Metadata = { title: "Terms and privacy · MarkedFox" };

export default function TermsPane() {
  return (
    <Pane
      title="Terms and privacy"
      blurb="What MarkedFox promises, and what it does with what you connect."
    >
      <PaneRow
        title="Privacy policy"
        detail="What is stored, where it lives, and how long it stays."
        action={
          <ButtonLink href="/privacy" size="sm">
            Read
          </ButtonLink>
        }
      />
      <PaneRow
        title="Terms of service"
        detail="The agreement between you and MarkedFox."
        action={
          <ButtonLink href="/terms" size="sm">
            Read
          </ButtonLink>
        }
      />
      <PaneRow
        title="Platform permissions"
        detail="Every platform you connect also lists MarkedFox in its own settings, and revoking it there disconnects it here."
        action={
          <ButtonLink href="/dashboard/settings/accounts" size="sm">
            Connected accounts
          </ButtonLink>
        }
      />
    </Pane>
  );
}
