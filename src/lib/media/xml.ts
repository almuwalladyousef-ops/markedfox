// Two string functions, because R2 answers in XML and the S3 API has one
// place where the round trip matters: the ETag of a multipart part.
//
// ListParts returns it with its quotes as entities — `&quot;abc&quot;` — and
// CompleteMultipartUpload wants the literal value back. Passing the entities
// through untouched, and escaping the `&` a second time on the way out, is
// what R2 answers with `InvalidPart: One or more of the specified parts could
// not be found` — a message that reads like a missing part rather than a
// mangled one, and cost a round trip against the live bucket to place.

export function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    // Last, so a literal `&amp;amp;` decodes to `&amp;` rather than to `&`.
    .replace(/&amp;/g, "&");
}

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
