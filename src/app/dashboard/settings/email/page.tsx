import type { Metadata } from "next";

import { getProfile } from "@/lib/account/preferences";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

import { Pane } from "../pane";
import { ProfileForm } from "../password/account-forms";

export const metadata: Metadata = { title: "Email and name · MarkedFox" };

export default async function EmailPane() {
  const user = await requireUser();
  const supabase = await createClient();
  const profile = await getProfile(supabase, user.id);

  return (
    <Pane
      title="Email and name"
      blurb="The address you sign in with, and the name shown beside your avatar."
      width="narrow"
    >
      <ProfileForm
        email={user.email ?? ""}
        displayName={profile?.displayName ?? ""}
      />
    </Pane>
  );
}
