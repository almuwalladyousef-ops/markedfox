// Parsing video links. Pure, and in its own file because a "use server" module
// may only export async functions — and because a link parser is exactly the
// kind of thing worth testing without a server around it.

/** youtu.be, /watch?v=, /shorts/, /embed/, or a bare 11-character id. */
export function parseYouTubeVideoId(raw: string): string | null {
  const input = raw.trim();
  if (/^[\w-]{11}$/.test(input)) return input;

  const patterns = [
    /youtu\.be\/([\w-]{11})/,
    /[?&]v=([\w-]{11})/,
    /\/shorts\/([\w-]{11})/,
    /\/embed\/([\w-]{11})/,
  ];
  for (const pattern of patterns) {
    const match = input.match(pattern);
    if (match) return match[1];
  }
  return null;
}
