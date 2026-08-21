import type { Metadata } from "next";

import { notFound } from "next/navigation";

import { PageHeader } from "@/components/ui";
import { LocalTime } from "@/components/local-time";
import { requireUser } from "@/lib/auth/session";
import { canUserDo } from "@/lib/entitlements/can-user-do";
import { getEntitlementSnapshot } from "@/lib/entitlements/snapshot";
import { configuredModel } from "@/lib/research/generate";
import {
  listLinkTranscripts,
  listScripts,
  listSources,
} from "@/lib/research/store";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspace } from "@/lib/workspaces/store";

import { AuditForm, HookGeneratorForm, TranscriptForm } from "./tools-forms";

export const metadata: Metadata = { title: "Tools · MarkedFox" };

// The standalone tools. Everything here works WITHOUT first tracking a channel
// and picking an outlier, which is the point: a creator who already knows their
// topic should not have to walk the whole engine to get twenty hooks.

export default async function ResearchToolsPage() {
  const user = await requireUser();
  const active = await getActiveWorkspace();
  if (!active) notFound();

  const supabase = await createClient();
  const snapshot = await getEntitlementSnapshot(supabase, user.id, active.id);
  if (!canUserDo(snapshot, { type: "use_research" }).allowed) notFound();

  const [sources, transcripts, scripts] = await Promise.all([
    listSources(supabase, active.id),
    listLinkTranscripts(supabase, active.id, 10),
    listScripts(supabase, active.id, 20),
  ]);

  const enabled = configuredModel() !== null;
  const creditsLeft =
    snapshot.limits.researchCreditsPerMonth -
    snapshot.usage.researchCreditsThisMonth;
  const standalone = scripts.filter(
    (s) => s.video_id === null || s.kind === "audit",
  );

  return (
    <>
      <PageHeader
        title="Tools"
        subtitle="Hooks, transcripts, and a channel audit — without walking the whole engine first."
      />

      <HookGeneratorForm enabled={enabled} creditsLeft={creditsLeft} />
      <TranscriptForm />
      <AuditForm
        sources={sources.map((s) => ({
          id: s.id,
          title: s.title,
          platform: s.platform,
        }))}
        enabled={enabled}
        creditsLeft={creditsLeft}
      />

      {transcripts.length > 0 ? (
        <section>
          <h2 className="text-sm font-semibold">Recent transcripts</h2>
          <ul className="mt-3 flex flex-col gap-2">
            {transcripts.map((transcript) => (
              <li
                key={transcript.id}
                className="rounded-lg border border-line bg-panel p-4"
              >
                <a
                  href={transcript.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-xs text-faint underline hover:text-ink"
                >
                  {transcript.url}
                </a>
                <p className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-muted">
                  {transcript.text}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {standalone.length > 0 ? (
        <section>
          <h2 className="text-sm font-semibold">Recent output</h2>
          <ul className="mt-3 flex flex-col gap-3">
            {standalone.map((script) => (
              <li
                key={script.id}
                className="rounded-lg border border-line bg-panel p-4"
              >
                <p className="text-xs text-faint">
                  {script.kind}
                  {script.topic ? ` · ${script.topic}` : ""} ·{" "}
                  <LocalTime value={script.created_at} />
                </p>
                <pre className="mt-2 whitespace-pre-wrap font-sans text-sm leading-relaxed text-ink">
                  {script.output}
                </pre>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
