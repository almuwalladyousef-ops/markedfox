import { describe, expect, it } from "vitest";

import { readProviderError } from "./provider-error";

const q = (s: string) => new URLSearchParams(s);

describe("readProviderError", () => {
  it("returns null for a normal callback", () => {
    expect(readProviderError(q("code=abc&state=xyz"))).toBeNull();
    expect(readProviderError(q(""))).toBeNull();
  });

  it("surfaces Meta's error_code/error_message spelling — the 2026-08-16 case", () => {
    const result = readProviderError(
      q(
        "error_code=100&error_message=Invalid+Scopes%3A+pages_manage_posts.+This+message+is+only+shown+to+developers.",
      ),
    );
    expect(result).toEqual({
      kind: "provider_error",
      message:
        "Invalid Scopes: pages_manage_posts. This message is only shown to developers.",
    });
  });

  it("surfaces the RFC 6749 spelling", () => {
    expect(
      readProviderError(q("error=invalid_scope&error_description=Bad+scope")),
    ).toEqual({ kind: "provider_error", message: "Bad scope" });
  });

  it("falls back to the error code itself when there is no message", () => {
    expect(readProviderError(q("error=server_error"))).toEqual({
      kind: "provider_error",
      message: "server_error",
    });
    expect(readProviderError(q("error_code=1349048"))).toEqual({
      kind: "provider_error",
    });
  });

  it("distinguishes the user pressing Cancel from the provider refusing", () => {
    expect(readProviderError(q("error=access_denied"))).toEqual({ kind: "denied" });
    expect(
      readProviderError(
        q("error=access_denied&error_reason=user_denied&error_description=Permissions+error"),
      ),
    ).toEqual({ kind: "denied" });
    expect(readProviderError(q("error_reason=user_denied"))).toEqual({
      kind: "denied",
    });
  });
});
