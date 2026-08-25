import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getUser } from "@/lib/auth/session";
import { safeRedirectPath } from "@/lib/auth/validation";

import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in · MarkedFox" };

// Messages for the failure modes the confirmation route redirects here with.
const LINK_ERRORS: Record<string, string> = {
  invalid_link: "That link was not valid. Request a new one below.",
  expired_link:
    "That link has expired or was already used. Request a new one below.",
};

export default async function LoginPage({
  searchParams,
}: {
  // Async in Next 16 — searchParams is a promise.
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;

  // Already signed in: skip the form rather than showing a login page to
  // someone with a valid session.
  const user = await getUser();
  if (user) redirect(safeRedirectPath(params.next));

  const linkError = params.error ? LINK_ERRORS[params.error] : undefined;

  return (
    <>
      {linkError ? (
        <p className="mb-4 rounded-md border border-warn bg-warn-soft px-3 py-2 text-[13px] text-warn">
          {linkError}
        </p>
      ) : null}
      <LoginForm next={safeRedirectPath(params.next)} />
    </>
  );
}
