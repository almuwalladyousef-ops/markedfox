"use client";

import { useActionState, useState } from "react";

import {
  Button,
  Card,
  Notice,
  Pill,
  formatCount,
  inputClass,
} from "@/components/ui";
import {
  generateDraftHooksAction,
  generateDraftScriptAction,
  generateResearchAction,
  goToStageAction,
  saveScriptStageAction,
  type StudioFormState,
} from "@/lib/research/studio-actions";
import {
  SCRIPT_STAGES,
  STAGE_LABELS,
  type HookOption,
  type ScriptDraftRow,
  type ScriptStage,
} from "@/lib/research/studio-types";

// The five-stage pipeline.
//
// Generating a script in one shot from one prompt is what a chat window already
// does. The value here is that the stages are separable and stored: research the
// topic, pick a hook from patterns that have already worked, set a style, then
// write — and walk back into any stage afterwards without losing the others.
//
// Every stage card says what the next step is and carries the button that
// advances to it, so the pipeline is legible from any one card.

const EMPTY: StudioFormState = {};

const STAGE_ICON: Record<ScriptStage, string> = {
  topic: "💡",
  research: "📖",
  hook: "⚿",
  style: "🖌",
  script: "📄",
};

export function ScriptBuilder({
  draft,
  hookTemplates,
  aiEnabled,
  creditsLeft,
}: {
  draft: ScriptDraftRow;
  hookTemplates: {
    id: string;
    formula: string;
    sourceHandle: string | null;
    sourceViews: number | null;
    favorite: boolean;
  }[];
  aiEnabled: boolean;
  creditsLeft: number;
}) {
  // Which stage is on screen follows the SAVED stage, with a local override
  // for the "Jump to" chips.
  //
  // This has to track the prop rather than initialise from it: saving a stage
  // revalidates the server component, which re-renders this one IN PLACE — the
  // instance survives, so a useState initialiser never runs again and "Save &
  // continue" would leave the user on the card they just finished, wondering
  // what the button did. Comparing against the previous prop is React's own
  // idiom for state derived from props.
  const [stage, setStage] = useState<ScriptStage>(draft.stage);
  const [seenStage, setSeenStage] = useState<ScriptStage>(draft.stage);
  if (draft.stage !== seenStage) {
    setSeenStage(draft.stage);
    setStage(draft.stage);
  }

  return (
    <div className="flex flex-col gap-4">
      <nav className="flex flex-wrap items-center gap-1 rounded-lg bg-neutral-900/60 p-1">
        <span className="px-2 text-xs text-neutral-500">Jump to:</span>
        {SCRIPT_STAGES.map((item) => (
          <form key={item} action={goToStageAction}>
            <input type="hidden" name="draft_id" value={draft.id} />
            <input type="hidden" name="stage" value={item} />
            <button
              type="submit"
              onClick={() => setStage(item)}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition ${
                stage === item
                  ? "bg-neutral-800 font-medium text-neutral-50"
                  : "text-neutral-400 hover:text-neutral-200"
              }`}
            >
              <span aria-hidden>{STAGE_ICON[item]}</span>
              {STAGE_LABELS[item]}
              {isDone(draft, item) ? (
                <span className="text-emerald-400">✓</span>
              ) : null}
            </button>
          </form>
        ))}
      </nav>

      {!aiEnabled ? (
        <Notice tone="warn">
          Generation needs an AI key on this deployment. Every stage still works
          by hand — write the research, the hook and the script yourself and the
          pipeline keeps them together.
        </Notice>
      ) : null}

      {stage === "topic" ? (
        <TopicStage draft={draft} />
      ) : stage === "research" ? (
        <ResearchStage draft={draft} aiEnabled={aiEnabled} creditsLeft={creditsLeft} />
      ) : stage === "hook" ? (
        <HookStage
          draft={draft}
          templates={hookTemplates}
          aiEnabled={aiEnabled}
          creditsLeft={creditsLeft}
        />
      ) : stage === "style" ? (
        <StyleStage draft={draft} />
      ) : (
        <ScriptStage draft={draft} aiEnabled={aiEnabled} creditsLeft={creditsLeft} />
      )}
    </div>
  );
}

function isDone(draft: ScriptDraftRow, stage: ScriptStage): boolean {
  switch (stage) {
    case "topic":
      return Boolean(draft.topic);
    case "research":
      return Boolean(draft.research_notes);
    case "hook":
      return Boolean(draft.chosen_hook);
    case "style":
      return Boolean(draft.style_notes);
    case "script":
      return Boolean(draft.script);
  }
}

function StageCard({
  title,
  hint,
  next,
  children,
  actions,
}: {
  title: string;
  hint?: string;
  next?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <Card className="p-0">
      <div className="border-b border-neutral-800 px-5 py-4">
        <h2 className="text-sm font-semibold">{title}</h2>
        {hint ? <p className="mt-1 text-xs text-neutral-500">{hint}</p> : null}
      </div>
      <div className="px-5 py-4">{children}</div>
      {next || actions ? (
        <div className="flex flex-wrap items-center gap-3 border-t border-neutral-800 px-5 py-3">
          {next ? (
            <span className="text-xs text-neutral-500">Next step: {next}</span>
          ) : null}
          <div className="ml-auto flex gap-2">{actions}</div>
        </div>
      ) : null}
    </Card>
  );
}

function TopicStage({ draft }: { draft: ScriptDraftRow }) {
  const [state, action, pending] = useActionState(saveScriptStageAction, EMPTY);
  return (
    <form action={action}>
      <input type="hidden" name="draft_id" value={draft.id} />
      <input type="hidden" name="stage" value="topic" />
      <StageCard
        title="Describe your topic"
        hint="What the video is about, in a sentence or two. Everything downstream is built from this."
        next="Research"
        actions={
          <Button type="submit" tone="primary" size="sm" disabled={pending}>
            {pending ? "Saving…" : "Save & continue"}
          </Button>
        }
      >
        <div className="flex flex-col gap-3">
          <input
            name="title"
            maxLength={80}
            defaultValue={draft.title}
            placeholder="Script name"
            className={inputClass}
          />
          <textarea
            name="topic"
            rows={4}
            required
            maxLength={1000}
            defaultValue={draft.topic ?? ""}
            placeholder="e.g. Most 'luxury' ingredients are cheap synthetics, and the industry has spent decades making the fake the reference point"
            className={`${inputClass} resize-y`}
          />
          {state.message ? (
            <Notice tone={state.ok ? "ok" : "warn"}>{state.message}</Notice>
          ) : null}
        </div>
      </StageCard>
    </form>
  );
}

function ResearchStage({
  draft,
  aiEnabled,
  creditsLeft,
}: {
  draft: ScriptDraftRow;
  aiEnabled: boolean;
  creditsLeft: number;
}) {
  const [saveState, saveAction, saving] = useActionState(
    saveScriptStageAction,
    EMPTY,
  );
  const [genState, genAction, generating] = useActionState(
    generateResearchAction,
    EMPTY,
  );

  return (
    <div className="flex flex-col gap-3">
      {aiEnabled ? (
        <form action={genAction}>
          <input type="hidden" name="draft_id" value={draft.id} />
          <Button type="submit" size="sm" disabled={generating}>
            {generating
              ? "Writing…"
              : draft.research_notes
                ? "Rewrite the research"
                : "Write the research for me"}
          </Button>
          <span className="ml-2 text-xs text-neutral-600">
            1 credit · {creditsLeft} left
          </span>
        </form>
      ) : null}

      {genState.message ? (
        <Notice tone={genState.ok ? "ok" : "warn"}>{genState.message}</Notice>
      ) : null}

      <form action={saveAction}>
        <input type="hidden" name="draft_id" value={draft.id} />
        <input type="hidden" name="stage" value="research" />
        <StageCard
          title="Review the research"
          hint="Facts, angles, and things worth checking. Edit it freely — this is what the script draws on."
          next="Hook"
          actions={
            <Button type="submit" tone="primary" size="sm" disabled={saving}>
              {saving ? "Saving…" : "Save & continue"}
            </Button>
          }
        >
          <textarea
            name="research_notes"
            rows={16}
            maxLength={8000}
            key={draft.research_notes ?? "empty"}
            defaultValue={draft.research_notes ?? ""}
            placeholder="Describe your topic first, then generate a research brief — or paste your own."
            className={`${inputClass} resize-y font-mono text-xs leading-relaxed`}
          />
          {saveState.message ? (
            <div className="mt-3">
              <Notice tone={saveState.ok ? "ok" : "warn"}>
                {saveState.message}
              </Notice>
            </div>
          ) : null}
        </StageCard>
      </form>
    </div>
  );
}

function HookStage({
  draft,
  templates,
  aiEnabled,
  creditsLeft,
}: {
  draft: ScriptDraftRow;
  templates: {
    id: string;
    formula: string;
    sourceHandle: string | null;
    sourceViews: number | null;
    favorite: boolean;
  }[];
  aiEnabled: boolean;
  creditsLeft: number;
}) {
  const [saveState, saveAction, saving] = useActionState(
    saveScriptStageAction,
    EMPTY,
  );
  const [genState, genAction, generating] = useActionState(
    generateDraftHooksAction,
    EMPTY,
  );
  const [picker, setPicker] = useState(false);
  const [chosen, setChosen] = useState(draft.chosen_hook ?? "");
  const [search, setSearch] = useState("");

  const options: HookOption[] = draft.hook_options ?? [];
  const visible = templates.filter(
    (template) =>
      !search ||
      template.formula.toLowerCase().includes(search.toLowerCase()) ||
      (template.sourceHandle ?? "").toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {aiEnabled ? (
          <Button size="sm" onClick={() => setPicker((v) => !v)}>
            {picker ? "Hide hook vault" : "Generate more hooks"}
          </Button>
        ) : null}
        {templates.length === 0 && aiEnabled ? (
          <span className="text-xs text-neutral-600">
            Your vault is empty, so hooks come from the built-in patterns. Save
            formulas from analysed videos and they get sharper.
          </span>
        ) : null}
      </div>

      {picker ? (
        <Card>
          <p className="text-sm font-medium">Generate more hooks</p>
          <p className="mt-1 text-xs text-neutral-500">
            Pick patterns from videos that already beat their channel. Each one
            produces a hook for this topic, keeping its shape.
          </p>
          <form action={genAction} className="mt-3 flex flex-col gap-3">
            <input type="hidden" name="draft_id" value={draft.id} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by hook template or channel"
              className={inputClass}
            />
            <ul className="grid max-h-72 gap-2 overflow-y-auto sm:grid-cols-2">
              {visible.map((template) => (
                <li key={template.id}>
                  <label className="flex h-full cursor-pointer gap-2 rounded-lg border border-neutral-800 p-3 transition hover:border-neutral-600">
                    <input
                      type="checkbox"
                      name="template_id"
                      value={template.id}
                      className="mt-0.5 accent-neutral-200"
                    />
                    <span className="min-w-0">
                      <span className="block font-mono text-xs text-neutral-200">
                        {template.formula}
                      </span>
                      <span className="mt-1 block text-[11px] text-neutral-500">
                        {template.favorite ? "★ " : ""}
                        {template.sourceHandle
                          ? `@${template.sourceHandle}`
                          : "typed by hand"}
                        {template.sourceViews !== null
                          ? ` · ${formatCount(template.sourceViews)} views`
                          : ""}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            <div className="flex items-center gap-3">
              <Button type="submit" tone="primary" size="sm" disabled={generating}>
                {generating ? "Generating…" : "Generate hooks"}
              </Button>
              <span className="text-xs text-neutral-600">
                1 credit · {creditsLeft} left
              </span>
            </div>
          </form>
        </Card>
      ) : null}

      {genState.message ? (
        <Notice tone={genState.ok ? "ok" : "warn"}>{genState.message}</Notice>
      ) : null}

      <form action={saveAction}>
        <input type="hidden" name="draft_id" value={draft.id} />
        <input type="hidden" name="stage" value="hook" />
        <input type="hidden" name="chosen_hook" value={chosen} />
        <StageCard
          title="Pick your favourite hook"
          hint="Each one was written by applying a pattern that already worked to your topic. The view count is the evidence behind the shape, not a promise about yours."
          next="Style"
          actions={
            <Button
              type="submit"
              tone="primary"
              size="sm"
              disabled={saving || !chosen.trim()}
            >
              {saving ? "Saving…" : "Save & continue"}
            </Button>
          }
        >
          {options.length === 0 ? (
            <p className="text-sm text-neutral-500">
              No hooks yet. Generate some above, or write your own below.
            </p>
          ) : (
            <ul className="grid gap-2 md:grid-cols-2">
              {options.map((option, index) => (
                <li key={index}>
                  <button
                    type="button"
                    onClick={() => setChosen(option.text)}
                    className={`flex h-full w-full flex-col gap-1.5 rounded-lg border p-3 text-left transition ${
                      chosen === option.text
                        ? "border-neutral-400 bg-neutral-900"
                        : "border-neutral-800 hover:border-neutral-600"
                    }`}
                  >
                    {option.sourceHandle ? (
                      <span className="text-[11px] text-neutral-500">
                        Inspired by @{option.sourceHandle}
                        {option.sourceViews
                          ? ` · ${formatCount(option.sourceViews)} views`
                          : ""}
                      </span>
                    ) : null}
                    <span className="text-sm leading-relaxed text-neutral-200">
                      {option.text}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <label className="mt-4 block">
            <span className="text-xs font-medium text-neutral-400">
              Or write your own
            </span>
            <textarea
              rows={2}
              value={chosen}
              onChange={(event) => setChosen(event.target.value)}
              maxLength={400}
              placeholder="The first line the viewer hears."
              className={`${inputClass} mt-1.5 resize-y`}
            />
          </label>

          {saveState.message ? (
            <div className="mt-3">
              <Notice tone={saveState.ok ? "ok" : "warn"}>
                {saveState.message}
              </Notice>
            </div>
          ) : null}
        </StageCard>
      </form>
    </div>
  );
}

function StyleStage({ draft }: { draft: ScriptDraftRow }) {
  const [state, action, pending] = useActionState(saveScriptStageAction, EMPTY);
  return (
    <form action={action}>
      <input type="hidden" name="draft_id" value={draft.id} />
      <input type="hidden" name="stage" value="style" />
      <StageCard
        title="Set the style"
        hint="Anything specific to this video. Your persona already covers the voice — this is for what makes this one different."
        next="Script"
        actions={
          <Button type="submit" tone="primary" size="sm" disabled={pending}>
            {pending ? "Saving…" : "Save & continue"}
          </Button>
        }
      >
        <textarea
          name="style_notes"
          rows={5}
          maxLength={2000}
          defaultValue={draft.style_notes ?? ""}
          placeholder="e.g. straight to camera, no b-roll, one long take, end on the cost rather than a call to action"
          className={`${inputClass} resize-y`}
        />
        {state.message ? (
          <div className="mt-3">
            <Notice tone={state.ok ? "ok" : "warn"}>{state.message}</Notice>
          </div>
        ) : null}
      </StageCard>
    </form>
  );
}

function ScriptStage({
  draft,
  aiEnabled,
  creditsLeft,
}: {
  draft: ScriptDraftRow;
  aiEnabled: boolean;
  creditsLeft: number;
}) {
  const [saveState, saveAction, saving] = useActionState(
    saveScriptStageAction,
    EMPTY,
  );
  const [genState, genAction, generating] = useActionState(
    generateDraftScriptAction,
    EMPTY,
  );
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      {draft.chosen_hook ? (
        <Card className="p-4">
          <p className="text-[10px] font-semibold tracking-widest text-neutral-500 uppercase">
            Opening line
          </p>
          <p className="mt-1 text-sm text-neutral-200 italic">
            &ldquo;{draft.chosen_hook}&rdquo;
          </p>
        </Card>
      ) : null}

      {aiEnabled ? (
        <form action={genAction} className="flex items-center gap-3">
          <input type="hidden" name="draft_id" value={draft.id} />
          <Button type="submit" size="sm" disabled={generating}>
            {generating
              ? "Writing…"
              : draft.script
                ? "Rewrite the script"
                : "Write the script"}
          </Button>
          <span className="text-xs text-neutral-600">
            1 credit · {creditsLeft} left
          </span>
        </form>
      ) : null}

      {genState.message ? (
        <Notice tone={genState.ok ? "ok" : "warn"}>{genState.message}</Notice>
      ) : null}

      <form action={saveAction}>
        <input type="hidden" name="draft_id" value={draft.id} />
        <input type="hidden" name="stage" value="script" />
        <StageCard
          title="The script"
          hint="Edit it like a document. Nothing here is regenerated unless you ask."
          actions={
            <>
              {draft.script ? (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    void navigator.clipboard.writeText(draft.script ?? "");
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  }}
                >
                  {copied ? "Copied" : "Copy"}
                </Button>
              ) : null}
              <Button type="submit" tone="primary" size="sm" disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </Button>
            </>
          }
        >
          <textarea
            name="script"
            rows={20}
            maxLength={20000}
            key={draft.script ?? "empty"}
            defaultValue={draft.script ?? ""}
            placeholder="Write it, or generate a first pass above."
            className={`${inputClass} resize-y leading-relaxed`}
          />
          {saveState.message ? (
            <div className="mt-3">
              <Notice tone={saveState.ok ? "ok" : "warn"}>
                {saveState.message}
              </Notice>
            </div>
          ) : null}
        </StageCard>
      </form>

      <p className="text-xs text-neutral-600">
        <Pill>Tip</Pill> The stages above stay filled in. Go back to Hook, pick a
        different one, and rewrite — the research and style come with it.
      </p>
    </div>
  );
}
