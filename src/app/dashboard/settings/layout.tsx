import type { ReactNode } from "react";

import { Page, PageHeader, StickyPane, TwoPane } from "@/components/ui";
import { getProfile } from "@/lib/account/preferences";
import { requireUser } from "@/lib/auth/session";
import { listConnections } from "@/lib/connections/store";
import { getEntitlementSnapshot } from "@/lib/entitlements/snapshot";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspace } from "@/lib/workspaces/store";

import { SettingsMenu, type MenuGroup } from "./settings-menu";

// Settings as one page with a menu and a pane, rather than the seven-card
// column it used to be.
//
// Connected accounts moved in here from its own top-level nav entry. It is
// setup: a person visits it twice in their first week and then not again, and
// a permanent nav row for it pushed the things they use daily further down.
// The menu, not the sidebar, is where infrequent things belong.

export default async function SettingsLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requireUser();
  const active = await getActiveWorkspace();
  const supabase = await createClient();

  const [profile, snapshot, connections] = await Promise.all([
    getProfile(supabase, user.id),
    active ? getEntitlementSnapshot(supabase, user.id, active.id) : null,
    active ? listConnections(supabase, active.id) : [],
  ]);

  const groups: MenuGroup[] = [
    {
      title: "My setup",
      rows: [
        {
          href: "/dashboard/settings/accounts",
          icon: "link",
          label: "Connected accounts",
          detail: "Instagram, X, TikTok and the rest",
          trail: String(connections.length),
        },
        {
          href: "/dashboard/settings/platform-order",
          icon: "grid",
          label: "Platform priority",
          detail: "Customize the home page order",
        },
        {
          href: "/dashboard/settings/post-type-order",
          icon: "play",
          label: "Post type priority",
          detail: "Customize the post type order",
        },
      ],
    },
    {
      title: "Manage my account",
      rows: [
        {
          href: "/dashboard/settings/password",
          icon: "shield",
          label: "Password and security",
        },
        { href: "/dashboard/settings/email", icon: "mail", label: "Email and name" },
        {
          href: "/dashboard/settings/picture",
          icon: "avatar",
          label: "Profile picture",
        },
      ],
    },
    {
      title: "Help and support",
      rows: [
        {
          href: "/dashboard/settings/help",
          icon: "question",
          label: "Get help",
          detail: "Contact us or read the answers",
        },
        {
          href: "/dashboard/settings/feedback",
          icon: "bang",
          label: "Send feedback or ideas",
        },
      ],
    },
    {
      title: "Subscription",
      rows: [
        {
          href: "/dashboard/settings/subscription",
          icon: "card",
          label: "Manage subscription",
          trail: snapshot?.planId ?? "free",
          trailAccent: true,
        },
      ],
    },
    {
      title: "More info and support",
      rows: [
        { href: "/dashboard/settings/data", icon: "chart", label: "Manage my data" },
        { href: "/dashboard/settings/appearance", icon: "paint", label: "Appearance" },
        { href: "/dashboard/settings/terms", icon: "doc", label: "Terms and privacy" },
      ],
    },
  ];

  return (
    <Page width="max-w-[1180px]">
      <PageHeader title="Settings" />
      {/* 328 + 560 exceeds the width a 1280px window leaves beside the rail, so
          the menu's base is trimmed to what fits; both panes keep the floors
          the handoff specifies and still stack below it. */}
      <TwoPane>
        <StickyPane className="min-w-[300px] flex-[0_1_312px]">
          <SettingsMenu
            groups={groups}
            name={profile?.displayName || (user.email ?? "Your account")}
            email={user.email ?? ""}
            avatarUrl={profile?.avatarUrl ?? null}
          />
        </StickyPane>
        <div className="min-w-[min(100%,440px)] flex-[1_1_520px]">{children}</div>
      </TwoPane>
    </Page>
  );
}
