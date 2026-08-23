import type { Metadata } from "next";

import { Notice } from "@/components/ui";
import { getProfile } from "@/lib/account/preferences";
import { requireUser } from "@/lib/auth/session";
import { isMediaStorageConfigured } from "@/lib/media/store";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspace } from "@/lib/workspaces/store";

import { Pane } from "../pane";
import { AvatarForm } from "../password/account-forms";

export const metadata: Metadata = { title: "Profile picture · MarkedFox" };

export default async function PicturePane() {
  const user = await requireUser();
  const active = await getActiveWorkspace();
  if (!active) return <Notice>No workspace is selected.</Notice>;

  const supabase = await createClient();
  const profile = await getProfile(supabase, user.id);

  return (
    <Pane
      title="Profile picture"
      blurb="Shown beside your name in MarkedFox. It is not sent to any platform — the picture on your Instagram is Instagram's."
      width="narrow"
    >
      <AvatarForm
        workspaceId={active.id}
        current={profile?.avatarUrl ?? null}
        uploadsEnabled={isMediaStorageConfigured()}
      />
    </Pane>
  );
}
