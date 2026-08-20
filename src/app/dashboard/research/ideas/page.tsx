import type { Metadata } from "next";

import Link from "next/link";

import { Notice, PageHeader, UpgradeCard } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { canUserDo } from "@/lib/entitlements/can-user-do";
import { getEntitlementSnapshot } from "@/lib/entitlements/snapshot";
import { discardAllInboxAction } from "@/lib/research/studio-actions";
import { listIdeas } from "@/lib/research/studio-store";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspace } from "@/lib/workspaces/store";

import { IdeaTriage } from "./idea-triage";

export const metadata: Metadata = { title: "Ideas · MarkedFox" };

export default async function IdeasPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const status = tab === "shortlist" ? "shortlisted" : "inbox";

  const user = await requireUser();
  const active = await getActiveWorkspace();
  if (!active) return <Notice>No workspace is selected.</Notice>;

  const supabase = await createClient();
  const snapshot = await getEntitlementSnapshot(supabase, user.id, active.id);
  const allowed = canUserDo(snapshot, { type: "use_research" });
  if (!allowed.allowed) {
    return (
      <>
        <PageHeader title="Ideas" />
        <UpgradeCard title="Studio" reason={allowed.reason}>
          Every video you break down leaves an idea here — the angle, not the
          other creator&rsquo;s headline — ready to shortlist, discard, or turn
          straight into a script.
        </UpgradeCard>
      </>
    );
  }

  const ideas = await listIdeas(supabase, active.id, status);

  return (
    <>
      <PageHeader
        title="Ideas"
        subtitle="Review ideas generated from the videos you analyzed."
        actions={
          status === "inbox" && ideas.length > 0 ? (
            <form action={discardAllInboxAction}>
              <button
                type="submit"
                className="text-sm text-neutral-500 transition hover:text-red-300"
              >
                Discard all
              </button>
            </form>
          ) : null
        }
      />

      <div className="flex gap-1 rounded-lg bg-neutral-900/60 p-1 sm:w-fit">
        <Tab href="/dashboard/research/ideas" label="Inbox" active={status === "inbox"} />
        <Tab
          href="/dashboard/research/ideas?tab=shortlist"
          label="Shortlist"
          active={status === "shortlisted"}
        />
      </div>

      <IdeaTriage ideas={ideas} status={status} />
    </>
  );
}

function Tab({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`rounded-md px-3 py-1.5 text-sm transition ${
        active
          ? "bg-neutral-800 font-medium text-neutral-50"
          : "text-neutral-400 hover:text-neutral-200"
      }`}
    >
      {label}
    </Link>
  );
}
