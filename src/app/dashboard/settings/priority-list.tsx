"use client";

import { useState, type ReactNode } from "react";

import { Icon } from "@/components/icons";
import { Button, cx, iconButtonClass } from "@/components/ui";
import { updatePreferenceAction } from "@/lib/account/actions";
import { move } from "@/lib/account/preferences";

// A reorderable list, moved with buttons rather than dragged.
//
// Drag-and-drop is the obvious thing here and the wrong one: these lists are
// three to nine rows, they are reordered once and then never again, and a drag
// target is the least accessible control there is — no keyboard, no screen
// reader, and on a phone it fights the page scroll. Two arrows per row work
// everywhere and are unambiguous.
//
// The whole order is posted on save, not a move instruction, so two tabs open
// on this page cannot interleave into an order neither of them asked for.

export function PriorityList({
  name,
  initial,
}: {
  /** The preferences key this list writes. */
  name: "platformOrder" | "postTypeOrder";
  /**
   * Already in the person's saved order, each carrying its own rendered label.
   *
   * A `render(id)` callback would be the obvious shape and cannot cross the
   * boundary: a function is not serialisable from a Server Component. Elements
   * are, so the server builds the labels and this component only reorders
   * them.
   */
  initial: { id: string; label: ReactNode }[];
}) {
  const [items, setItems] = useState(initial);
  const ids = items.map((item) => item.id);
  const dirty = ids.join(",") !== initial.map((item) => item.id).join(",");

  return (
    <form action={updatePreferenceAction} className="flex flex-col gap-4">
      <input type="hidden" name="key" value={name} />
      {ids.map((id) => (
        <input key={id} type="hidden" name="value" value={id} />
      ))}

      <ol className="flex flex-col gap-2">
        {items.map((item, index) => (
          <li
            key={item.id}
            className="flex items-center gap-3.5 rounded-lg border border-line bg-panel px-4 py-3"
          >
            <span
              aria-hidden
              className="font-display w-5 shrink-0 text-[14px] font-bold text-faint"
            >
              {index + 1}
            </span>
            <span className="flex min-w-0 flex-1 items-center gap-3">
              {item.label}
            </span>
            <span className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                aria-label={`Move up`}
                disabled={index === 0}
                onClick={() => setItems((list) => move(list, index, -1))}
                className={cx(iconButtonClass, "h-[30px] w-[30px]")}
              >
                <Icon name="chevronUp" className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                aria-label={`Move down`}
                disabled={index === items.length - 1}
                onClick={() => setItems((list) => move(list, index, 1))}
                className={cx(iconButtonClass, "h-[30px] w-[30px]")}
              >
                <Icon name="chevronDown" className="h-3.5 w-3.5" />
              </button>
            </span>
          </li>
        ))}
      </ol>

      <div className="flex items-center gap-3">
        <Button type="submit" tone="primary" size="sm" disabled={!dirty}>
          Save order
        </Button>
        {dirty ? (
          <button
            type="button"
            onClick={() => setItems(initial)}
            className="text-[13px] text-faint transition-[color] duration-110 hover:text-ink"
          >
            Undo
          </button>
        ) : (
          <span className="text-[13px] text-faint">Saved.</span>
        )}
      </div>
    </form>
  );
}
