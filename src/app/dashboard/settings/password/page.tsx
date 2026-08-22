import type { Metadata } from "next";

import { Pane } from "../pane";
import { PasswordForm } from "./account-forms";

export const metadata: Metadata = { title: "Password and security · MarkedFox" };

export default function PasswordPane() {
  return (
    <Pane
      title="Password and security"
      blurb="Your session is the proof of who you are, so the current password is not asked for again here. Changing it does not sign out your other devices."
      width="narrow"
    >
      <PasswordForm />
    </Pane>
  );
}
