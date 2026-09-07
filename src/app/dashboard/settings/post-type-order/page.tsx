import type { Metadata } from "next";

import { Icon, type IconName } from "@/components/icons";
import { Notice } from "@/components/ui";
import { POST_TYPE_LABELS, getProfile } from "@/lib/account/preferences";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

import { Pane } from "../pane";
import { PriorityList } from "../priority-list";
import type { MediaTab } from "@/lib/accounts/types";

export const metadata: Metadata = { title: "Post type priority · MarkedFox" };

const ICONS: Record<MediaTab, IconName> = {
  video: "play",
  long: "filmstrip",
  photo: "image",
  text: "drafts",
};

export default async function PostTypeOrderPane() {
  const user = await requireUser();
  const supabase = await createClient();
  const profile = await getProfile(supabase, user.id);
  if (!profile) return <Notice>Could not read your profile.</Notice>;

  return (
    <Pane
      title="Post type priority"
      blurb="The order of the filter row under your profile on the home screen. Somebody who only makes short video should not have to reach past photos to find it."
    >
      <PriorityList
        name="postTypeOrder"
        initial={profile.preferences.postTypeOrder.map((kind: MediaTab) => ({
          id: kind,
          label: (
            <>
              <Icon name={ICONS[kind]} className="h-[18px] w-[18px] text-muted" />
              <span className="truncate text-[14.5px] font-semibold text-ink">
                {POST_TYPE_LABELS[kind]}
              </span>
            </>
          ),
        }))}
      />
    </Pane>
  );
}
