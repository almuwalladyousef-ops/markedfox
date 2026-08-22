import type { Metadata } from "next";

import { PlatformTile } from "@/components/platform-icon";
import { Notice } from "@/components/ui";
import { getProfile } from "@/lib/account/preferences";
import { requireUser } from "@/lib/auth/session";
import { PLATFORM_LABELS } from "@/lib/platforms/labels";
import type { Platform } from "@/lib/platforms/types";
import { createClient } from "@/lib/supabase/server";

import { Pane } from "../pane";
import { PriorityList } from "../priority-list";

export const metadata: Metadata = { title: "Platform priority · MarkedFox" };

export default async function PlatformOrderPane() {
  const user = await requireUser();
  const supabase = await createClient();
  const profile = await getProfile(supabase, user.id);
  if (!profile) return <Notice>Could not read your profile.</Notice>;

  return (
    <Pane
      title="Platform priority"
      blurb="The order accounts are walked through on the home screen. Put the platform you actually work in first — it is the one you will open every day."
    >
      <PriorityList
        name="platformOrder"
        initial={profile.preferences.platformOrder.map((platform: Platform) => ({
          id: platform,
          label: (
            <>
              <PlatformTile platform={platform} size={26} />
              <span className="truncate text-[14.5px] font-semibold text-ink">
                {PLATFORM_LABELS[platform]}
              </span>
            </>
          ),
        }))}
      />
    </Pane>
  );
}
