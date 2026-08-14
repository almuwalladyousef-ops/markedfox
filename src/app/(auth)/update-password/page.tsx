import type { Metadata } from "next";

import { requireUser } from "@/lib/auth/session";

import { UpdatePasswordForm } from "./update-form";

export const metadata: Metadata = { title: "Set a new password · MarkedFox" };

// Reached from a recovery link, which the confirmation route has already
// exchanged for a session. requireUser is what enforces that: arriving here
// without one bounces to /login rather than showing a form that cannot work.
export default async function UpdatePasswordPage() {
  await requireUser();
  return <UpdatePasswordForm />;
}
