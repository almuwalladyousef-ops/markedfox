// Pulling an email address out of a DM.
//
// People do not answer "what's your email?" with a bare address. They answer
// with "sure it's me@example.com thanks!!", or with the address split by a
// phone keyboard's autocapitalisation, or with nothing resembling an address at
// all because they misread the question. So this extracts rather than
// validates, and returns null often — a rule that stored "sure thanks" as
// somebody's email address would poison the export it exists to fill.

// Deliberately conservative: no unicode domains, no plus-addressing edge cases
// beyond the obvious, no attempt at the full RFC grammar. A false negative
// costs one address; a false positive costs the list's credibility.
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,24}/;

export function extractEmail(text: string): string | null {
  if (!text) return null;
  // Strip the zero-width and directional characters some keyboards insert,
  // which otherwise split an address down the middle.
  const cleaned = text.replace(/[​-‍﻿‪-‮]/g, "");
  const match = cleaned.match(EMAIL);
  if (!match) return null;

  const address = match[0].toLowerCase();
  // A trailing dot is punctuation from the sentence, not part of the address.
  const trimmed = address.replace(/\.+$/, "");
  if (trimmed.length > 254) return null;

  const [local, domain] = trimmed.split("@");
  if (!local || !domain || domain.startsWith("-") || domain.endsWith("-")) {
    return null;
  }
  return trimmed;
}
