import { Fragment, type ReactNode } from "react";

import { cx } from "./ui";

// Rendering what a model wrote.
//
// Every model here is asked for an outline or a script and answers in markdown,
// because that is what models do. Until now the app printed that answer inside
// `<pre className="whitespace-pre-wrap">`, so a heading arrived as "## Hook" and
// a bolded beat arrived with its asterisks showing. The output was correct and
// looked broken.
//
// Hand-written rather than a dependency, for the same reason `icons.tsx` and
// the SigV4 signer are: this needs five constructs, and a markdown library
// brings a parser, a sanitiser and a supply chain to render bold text.
//
// It returns REACT ELEMENTS and never touches `dangerouslySetInnerHTML`. That
// is the whole safety story: model output is text that came from a video
// somebody else uploaded, so it is untrusted, and there is no path here by
// which it could become markup.

type Inline = { bold?: boolean; italic?: boolean; text: string };

/**
 * Split one line into styled runs.
 *
 * `**` before `*`, because otherwise the italic rule eats the first asterisk of
 * every bold marker and the whole line renders wrong from there. Unmatched
 * markers are left as literal characters — a lone asterisk in a script is a
 * lone asterisk, not the start of something the author forgot to close.
 */
export function parseInline(line: string): Inline[] {
  const out: Inline[] = [];
  const pattern = /\*\*(.+?)\*\*|__(.+?)__|\*(.+?)\*|_(.+?)_/g;
  let last = 0;
  for (const match of line.matchAll(pattern)) {
    const at = match.index;
    if (at > last) out.push({ text: line.slice(last, at) });
    const bold = match[1] ?? match[2];
    if (bold !== undefined) out.push({ bold: true, text: bold });
    else out.push({ italic: true, text: match[3] ?? match[4] ?? "" });
    last = at + match[0].length;
  }
  if (last < line.length) out.push({ text: line.slice(last) });
  return out;
}

function Inlines({ line }: { line: string }) {
  return (
    <>
      {parseInline(line).map((run, i) => (
        <Fragment key={i}>
          {run.bold ? (
            <strong className="font-semibold text-ink">{run.text}</strong>
          ) : run.italic ? (
            <em>{run.text}</em>
          ) : (
            run.text
          )}
        </Fragment>
      ))}
    </>
  );
}

type Block =
  | { kind: "heading"; level: 1 | 2 | 3; text: string }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "paragraph"; lines: string[] };

/** Group lines into blocks. Blank lines end a block; a list ends as soon as a
 *  line stops looking like an item, so a paragraph directly under a list is not
 *  swallowed into it. */
export function parseBlocks(source: string): Block[] {
  const blocks: Block[] = [];
  // Normalise the line endings a model may emit before anything reads them.
  const lines = source.replace(/\r\n?/g, "\n").split("\n");

  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flush = () => {
    if (paragraph.length > 0) {
      blocks.push({ kind: "paragraph", lines: paragraph });
      paragraph = [];
    }
    if (list) {
      blocks.push({ kind: "list", ...list });
      list = null;
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flush();
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      // Levels beyond 3 collapse to 3: a model that reaches for h5 is
      // decorating, and six sizes of heading in a script is noise.
      const level = Math.min(heading[1].length, 3) as 1 | 2 | 3;
      blocks.push({ kind: "heading", level, text: heading[2] });
      continue;
    }

    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      const ordered = Boolean(numbered);
      const text = (bullet?.[1] ?? numbered?.[1] ?? "").trim();
      if (paragraph.length > 0) {
        blocks.push({ kind: "paragraph", lines: paragraph });
        paragraph = [];
      }
      // A switch between bullets and numbers starts a new list rather than
      // mixing two kinds of marker inside one.
      if (list && list.ordered !== ordered) {
        blocks.push({ kind: "list", ...list });
        list = null;
      }
      list ??= { ordered, items: [] };
      list.items.push(text);
      continue;
    }

    if (list) {
      blocks.push({ kind: "list", ...list });
      list = null;
    }
    paragraph.push(line);
  }

  flush();
  return blocks;
}

/**
 * Render model output.
 *
 * `tone` exists because the same renderer serves a script (which is the
 * content of the page) and a transcript quote (which is reference material
 * beside it), and those want different weight.
 */
export function Markdown({
  children,
  className,
  tone = "ink",
}: {
  children: string;
  className?: string;
  tone?: "ink" | "muted";
}): ReactNode {
  const blocks = parseBlocks(children ?? "");
  const body = tone === "muted" ? "text-muted" : "text-ink";

  return (
    <div
      className={cx(
        "flex flex-col gap-3 text-[14.5px]/[22px]",
        body,
        className,
      )}
    >
      {blocks.map((block, i) => {
        if (block.kind === "heading") {
          const size =
            block.level === 1
              ? "text-[17px]/[24px]"
              : block.level === 2
                ? "text-[15.5px]/[22px]"
                : "text-[14.5px]/[21px]";
          return (
            <p
              key={i}
              className={cx(
                "font-display font-bold tracking-[-0.01em] text-ink",
                size,
                // A heading that is not the first thing on the page needs air
                // above it, or it reads as part of the block before it.
                i > 0 && "mt-2",
              )}
            >
              <Inlines line={block.text} />
            </p>
          );
        }

        if (block.kind === "list") {
          const List = block.ordered ? "ol" : "ul";
          return (
            <List
              key={i}
              className={cx(
                "flex flex-col gap-1.5 pl-5",
                block.ordered ? "list-decimal" : "list-disc",
              )}
            >
              {block.items.map((item, j) => (
                <li key={j} className="pl-0.5">
                  <Inlines line={item} />
                </li>
              ))}
            </List>
          );
        }

        return (
          <p key={i} className="text-pretty">
            {block.lines.map((line, j) => (
              <Fragment key={j}>
                {j > 0 ? <br /> : null}
                <Inlines line={line} />
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
