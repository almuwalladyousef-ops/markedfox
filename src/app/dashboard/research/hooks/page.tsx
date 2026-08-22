import type { Metadata } from "next";

import Link from "next/link";

import {
  Button,
  ButtonLink,
  Card,
  EmptyState,
  Notice,
  Page,
  PageHeader,
  Pill,
  UpgradeCard,
  formatCount,
  inputClass,
} from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { canUserDo } from "@/lib/entitlements/can-user-do";
import { getEntitlementSnapshot } from "@/lib/entitlements/snapshot";
import { HOOK_TYPE_LABELS, type HookType } from "@/lib/research/breakdown";
import {
  deleteHookAction,
  saveHookAction,
  toggleHookFavoriteAction,
} from "@/lib/research/studio-actions";
import { listHookTemplates } from "@/lib/research/studio-store";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspace } from "@/lib/workspaces/store";

export const metadata: Metadata = { title: "Hooks · MarkedFox" };

// The vault, and the highest-leverage thing in the pillar.
//
// A hook formula lifted from a video that already earned a million views is a
// pattern with evidence behind it. A hook a model invents from nothing is a
// guess dressed as one. This page is where the evidence accumulates, which is
// why the product gets better the longer somebody uses it rather than staying
// exactly as good as the model behind it.

export default async function HooksPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; fav?: string }>;
}) {
  const { q, fav } = await searchParams;
  const user = await requireUser();
  const active = await getActiveWorkspace();
  if (!active) return <Notice>No workspace is selected.</Notice>;

  const supabase = await createClient();
  const snapshot = await getEntitlementSnapshot(supabase, user.id, active.id);
  const allowed = canUserDo(snapshot, { type: "use_research" });
  if (!allowed.allowed) {
    return (
      <Page width="max-w-[900px]">
        <PageHeader title="Hooks" />
        <UpgradeCard title="Studio" reason={allowed.reason}>
          Save the opening pattern from every video you break down. The script
          builder then writes new hooks by filling those patterns for your
          topic — using shapes that already worked in your niche rather than a
          model&rsquo;s taste.
        </UpgradeCard>
      </Page>
    );
  }

  const hooks = await listHookTemplates(supabase, active.id, {
    search: q,
    favoritesOnly: fav === "1",
  });

  return (
    <Page width="max-w-[900px]">
      <PageHeader
        title="Hook vault"
        subtitle="Opening patterns lifted from videos that beat their channel's average. The script builder fills these in for your topic."
        actions={<Pill className="text-[13px]">{hooks.length} saved</Pill>}
      />

      <div className="flex flex-wrap items-end gap-3">
        <form method="get" className="flex flex-1 flex-wrap items-center gap-2">
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search by formula, category, or channel"
            className={`${inputClass} w-[280px]! flex-none`}
          />
          <label className="flex items-center gap-2 text-[14.5px] text-muted">
            <input
              type="checkbox"
              name="fav"
              value="1"
              defaultChecked={fav === "1"}
              className="accent-accent"
            />
            Favourites only
          </label>
          <Button type="submit" size="sm">
            Search
          </Button>
          {q || fav ? (
            <Link
              href="/dashboard/research/hooks"
              className="text-[13px] text-faint hover:text-ink"
            >
              Clear
            </Link>
          ) : null}
        </form>
      </div>

      <Card>
        <details>
          <summary className="cursor-pointer text-[13px] font-semibold text-accent">
            + Add a formula by hand
          </summary>
          <form action={saveHookAction} className="mt-4 flex flex-col gap-3">
            <label className="block">
              <span className="text-[13px] font-semibold text-muted">
                Formula
              </span>
              <input
                name="formula"
                required
                maxLength={400}
                placeholder="Most people have never [experienced] [common thing]."
                className={`${inputClass} mt-1.5 font-mono text-[13px]`}
              />
              <span className="mt-1 block text-[13px] text-faint">
                Put the parts that change in [brackets] — that is what makes it
                reusable for another topic.
              </span>
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-[13px] font-semibold text-muted">
                  Example line
                </span>
                <input
                  name="example"
                  maxLength={400}
                  className={`${inputClass} mt-1.5`}
                />
              </label>
              <label className="block">
                <span className="text-[13px] font-semibold text-muted">
                  Category
                </span>
                <select name="category" className={`${inputClass} mt-1.5`}>
                  <option value="">—</option>
                  {(Object.keys(HOOK_TYPE_LABELS) as HookType[]).map((type) => (
                    <option key={type} value={type}>
                      {HOOK_TYPE_LABELS[type].split(" — ")[0]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <Button type="submit" tone="primary" size="sm" className="w-fit">
              Save to vault
            </Button>
          </form>
        </details>
      </Card>

      {hooks.length === 0 ? (
        <EmptyState
          title={q || fav ? "Nothing matches" : "The vault is empty"}
          action={
            q || fav ? null : (
              <ButtonLink href="/dashboard/research" tone="primary">
                Go to the feed
              </ButtonLink>
            )
          }
        >
          {q || fav
            ? "Try fewer words, or clear the filter."
            : "Break a video down, then press Save hook to vault on it. Every saved pattern makes the next script's hooks better."}
        </EmptyState>
      ) : (
        <ul className="grid gap-3 shell:grid-cols-2">
          {hooks.map((hook) => (
            <li
              key={hook.id}
              className={`flex flex-col gap-2 rounded-[14px] border px-4 py-[15px] ${
                hook.favorite
                  ? "border-[rgba(217,119,6,.45)] bg-warn-soft"
                  : "border-line bg-panel"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="font-mono text-[13px]/[19px] text-ink">
                  {hook.formula}
                </p>
                <div className="flex shrink-0 gap-1">
                  <form action={toggleHookFavoriteAction}>
                    <input type="hidden" name="hook_id" value={hook.id} />
                    <input
                      type="hidden"
                      name="favorite"
                      value={hook.favorite ? "0" : "1"}
                    />
                    <button
                      type="submit"
                      aria-label={hook.favorite ? "Unfavourite" : "Favourite"}
                      className={`rounded px-1.5 py-1 text-[14.5px] transition ${
                        hook.favorite ? "text-warn" : "text-line-strong hover:text-warn"
                      }`}
                    >
                      ★
                    </button>
                  </form>
                  <form action={deleteHookAction}>
                    <input type="hidden" name="hook_id" value={hook.id} />
                    <button
                      type="submit"
                      aria-label="Delete"
                      className="rounded px-1.5 py-1 text-[14.5px] text-faint transition hover:text-danger"
                    >
                      ×
                    </button>
                  </form>
                </div>
              </div>

              {hook.example ? (
                <p className="text-[13.5px]/[20px] text-muted italic">
                  &ldquo;{hook.example}&rdquo;
                </p>
              ) : null}

              <div className="mt-auto flex flex-wrap items-center gap-2 pt-1 text-[12.5px] text-faint">
                {hook.category ? (
                  <Pill tone="accent">
                    {HOOK_TYPE_LABELS[hook.category as HookType]?.split(
                      " — ",
                    )[0] ?? hook.category}
                  </Pill>
                ) : null}
                {hook.source_handle ? (
                  <span>@{hook.source_handle}</span>
                ) : null}
                {hook.source_views !== null ? (
                  <span>· {formatCount(hook.source_views)} views</span>
                ) : null}
                {hook.video_id ? (
                  <Link
                    href={`/dashboard/research/${hook.video_id}`}
                    className="ml-auto underline hover:text-ink"
                  >
                    Source
                  </Link>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}
