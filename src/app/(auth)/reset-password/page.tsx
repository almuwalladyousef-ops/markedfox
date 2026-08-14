import type { Metadata } from "next";

import { ResetForm } from "./reset-form";

export const metadata: Metadata = { title: "Reset your password · MarkedFox" };

// Deliberately reachable while signed in: a user who suspects their password is
// compromised should not have to sign out first.
export default function ResetPasswordPage() {
  return <ResetForm />;
}
