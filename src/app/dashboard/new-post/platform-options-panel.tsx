"use client";

import { Icon, type IconName } from "@/components/icons";
import { PlatformBadge } from "@/components/platform-icon";
import { Card, CardTitle, Toggle } from "@/components/ui";
import type { PlatformOptionSpec } from "@/lib/platforms/publish-options";
import type { Platform, PlatformPublishOptions } from "@/lib/platforms/types";

// "Share on YouTube", "Share on X" — one section per selected platform,
// rendered from that platform's own declaration rather than from a switch
// statement here. Adding a setting is an entry in publish-options.ts; this
// file never changes.
//
// Each section says whose settings these are, because a composer that posts to
// five platforms at once needs to make it obvious that the visibility control
// under "YouTube" does not touch the other four.

export function PlatformOptionsPanel({
  platform,
  spec,
  values,
  onChange,
  hasVideo,
  variant = "card",
}: {
  platform: Platform;
  spec: PlatformOptionSpec;
  values: PlatformPublishOptions;
  onChange: (next: PlatformPublishOptions) => void;
  hasVideo: boolean;
  /** "split" is the composer's own layout: the platform and what these
   *  settings are on the left, the controls themselves on the right. */
  variant?: "card" | "split";
}) {
  // A settings section for something the post cannot be is noise: Instagram's
  // reel options mean nothing on a photo.
  if (spec.videoOnly && !hasVideo) return null;

  const set = (key: string, value: string | boolean) => {
    onChange({ ...values, [key]: value });
  };

  /** The glyph beside a label. Optional in the declaration, so a field with
   *  none simply indents to match the ones that have one. */
  const glyph = (field: { icon?: IconName }) =>
    field.icon ? (
      <Icon
        name={field.icon}
        className="mt-0.5 h-[17px] w-[17px] shrink-0 text-muted"
      />
    ) : (
      <span aria-hidden className="w-[17px] shrink-0" />
    );

  const fields = (
    <div className="flex flex-col divide-y divide-line">
      {spec.fields.map((field) => {
          const id = `${platform}-${field.key}`;
          if (field.kind === "toggle") {
            const checked =
              typeof values[field.key] === "boolean"
                ? (values[field.key] as boolean)
                : field.default;
            return (
              /* The shared Toggle, not a hand-rolled one. This file used to
                 draw its own — a green track with an orange knob, which is
                 where "the toggle looks orange green" came from. Three
                 switches in one app is two too many. */
              <div
                key={field.key}
                title={field.showHelp ? undefined : field.help}
                className="flex items-start justify-between gap-4 py-3"
              >
                <label htmlFor={id} className="flex min-w-0 gap-2.5 text-pretty">
                  {glyph(field)}
                  <span className="min-w-0">
                  <span className="text-sm text-ink">{field.label}</span>
                  {field.help && field.showHelp ? (
                    <span className="mt-0.5 block text-xs text-faint">
                      {field.help}
                    </span>
                  ) : null}
                  </span>
                </label>
                <Toggle
                  id={id}
                  on={checked}
                  label={field.label}
                  onClick={() => set(field.key, !checked)}
                  className="mt-0.5"
                />
              </div>
            );
          }

          if (field.kind === "select") {
            const value = String(values[field.key] ?? field.default);
            return (
              <div
                key={field.key}
                title={field.showHelp ? undefined : field.help}
                className="py-3"
              >
                <div className="flex items-center justify-between gap-4">
                  <label htmlFor={id} className="flex min-w-0 items-center gap-2.5 text-sm text-ink">
                    {glyph(field)}
                    {field.label}
                  </label>
                  {/* The value reads as the answer, on the right, the way a
                      settings row does — the select itself is transparent and
                      right-aligned over it rather than a boxed field. */}
                  <select
                    id={id}
                    value={value}
                    onChange={(event) => set(field.key, event.target.value)}
                    className="max-w-[55%] shrink-0 cursor-pointer truncate rounded-lg border-0 bg-transparent py-1 pr-1 text-right text-sm text-muted outline-none hover:text-ink focus:text-ink"
                  >
                    {field.choices.map((choice) => (
                      <option key={choice.value} value={choice.value}>
                        {choice.label}
                      </option>
                    ))}
                  </select>
                </div>
                {field.help && field.showHelp ? (
                  <p className="mt-1 pl-[27px] text-xs text-faint">
                    {field.help}
                  </p>
                ) : null}
              </div>
            );
          }

          const text = String(values[field.key] ?? "");
          return (
            <div
              key={field.key}
              title={field.showHelp ? undefined : field.help}
              className="py-3"
            >
              <label
                htmlFor={id}
                className="flex items-center gap-2.5 text-sm text-ink"
              >
                {glyph(field)}
                {field.label}
              </label>
              {field.multiline ? (
                <textarea
                  id={id}
                  rows={3}
                  value={text}
                  maxLength={field.maxLength}
                  placeholder={field.placeholder}
                  onChange={(event) => set(field.key, event.target.value)}
                  className="mt-1 ml-[27px] w-[calc(100%-27px)] resize-y rounded-lg border border-line bg-chip px-3 py-2 text-sm text-ink outline-none placeholder:text-faint focus:border-line-strong"
                />
              ) : (
                <input
                  id={id}
                  value={text}
                  maxLength={field.maxLength}
                  placeholder={field.placeholder}
                  onChange={(event) => set(field.key, event.target.value)}
                  className="mt-1 ml-[27px] w-[calc(100%-27px)] rounded-lg border border-line bg-chip px-3 py-2 text-sm text-ink outline-none placeholder:text-faint focus:border-line-strong"
                />
              )}
              <p className="mt-1 ml-[27px] flex justify-between text-xs text-faint">
                <span>{field.showHelp ? field.help : ""}</span>
                {text ? (
                  <span
                    className={
                      text.length > field.maxLength ? "text-danger" : undefined
                    }
                  >
                    {text.length}/{field.maxLength}
                  </span>
                ) : null}
              </p>
            </div>
          );
      })}
    </div>
  );

  if (variant === "split") {
    return (
      <section className="grid gap-x-6 gap-y-3 border-t border-line py-6 wide:grid-cols-[minmax(0,190px)_minmax(0,1fr)]">
        <div>
          <h3 className="font-display flex items-center gap-2 text-[15.5px] font-bold tracking-[-0.01em] text-ink">
            <PlatformBadge platform={platform} className="h-6 w-6" />
            {spec.title}
          </h3>
          <p className="mt-1.5 text-[12.5px]/[18px] text-muted">{spec.note}</p>
        </div>
        {fields}
      </section>
    );
  }

  return (
    <Card className="p-4">
      <CardTitle hint={spec.note}>{spec.title}</CardTitle>
      <div className="mt-4">{fields}</div>
    </Card>
  );
}
