"use client";

import { Card, CardTitle } from "@/components/ui";
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
}: {
  platform: Platform;
  spec: PlatformOptionSpec;
  values: PlatformPublishOptions;
  onChange: (next: PlatformPublishOptions) => void;
  hasVideo: boolean;
}) {
  // A settings section for something the post cannot be is noise: Instagram's
  // reel options mean nothing on a photo.
  if (spec.videoOnly && !hasVideo) return null;

  const set = (key: string, value: string | boolean) => {
    onChange({ ...values, [key]: value });
  };

  return (
    <Card className="p-4">
      <CardTitle hint={spec.note}>{spec.title}</CardTitle>

      <div className="mt-4 flex flex-col gap-4">
        {spec.fields.map((field) => {
          const id = `${platform}-${field.key}`;
          if (field.kind === "toggle") {
            const checked =
              typeof values[field.key] === "boolean"
                ? (values[field.key] as boolean)
                : field.default;
            return (
              <div key={field.key} className="flex items-start justify-between gap-4">
                <label htmlFor={id} className="min-w-0">
                  <span className="text-sm text-ink">{field.label}</span>
                  {field.help ? (
                    <span className="mt-0.5 block text-xs text-faint">
                      {field.help}
                    </span>
                  ) : null}
                </label>
                <button
                  id={id}
                  type="button"
                  role="switch"
                  aria-checked={checked}
                  aria-label={field.label}
                  onClick={() => set(field.key, !checked)}
                  className={`relative mt-0.5 inline-flex h-5 w-10 shrink-0 items-center rounded-full transition ${
                    checked ? "bg-ok" : "bg-chip"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-accent transition ${
                      checked ? "translate-x-5" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>
            );
          }

          if (field.kind === "select") {
            const value = String(values[field.key] ?? field.default);
            return (
              <div key={field.key}>
                <label htmlFor={id} className="text-sm text-ink">
                  {field.label}
                </label>
                <select
                  id={id}
                  value={value}
                  onChange={(event) => set(field.key, event.target.value)}
                  className="mt-1 w-full rounded-lg border border-line bg-chip px-3 py-2 text-sm text-ink outline-none focus:border-line-strong"
                >
                  {field.choices.map((choice) => (
                    <option key={choice.value} value={choice.value}>
                      {choice.label}
                    </option>
                  ))}
                </select>
                {field.help ? (
                  <p className="mt-1 text-xs text-faint">{field.help}</p>
                ) : null}
              </div>
            );
          }

          const text = String(values[field.key] ?? "");
          return (
            <div key={field.key}>
              <label htmlFor={id} className="text-sm text-ink">
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
                  className="mt-1 w-full resize-y rounded-lg border border-line bg-chip px-3 py-2 text-sm text-ink outline-none placeholder:text-faint focus:border-line-strong"
                />
              ) : (
                <input
                  id={id}
                  value={text}
                  maxLength={field.maxLength}
                  placeholder={field.placeholder}
                  onChange={(event) => set(field.key, event.target.value)}
                  className="mt-1 w-full rounded-lg border border-line bg-chip px-3 py-2 text-sm text-ink outline-none placeholder:text-faint focus:border-line-strong"
                />
              )}
              <p className="mt-1 flex justify-between text-xs text-faint">
                <span>{field.help}</span>
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
    </Card>
  );
}
