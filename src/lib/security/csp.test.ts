import { describe, expect, it } from "vitest";

import {
  buildContentSecurityPolicy,
  generateNonce,
  originOf,
} from "./csp";

function directives(policy: string): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const part of policy.split(";").map((p) => p.trim()).filter(Boolean)) {
    const [name, ...values] = part.split(/\s+/);
    map.set(name, values);
  }
  return map;
}

const BASE = {
  nonce: "TESTNONCE",
  supabaseUrl: "https://pktdpxpafycyqiusvyhq.supabase.co",
  r2PublicBaseUrl: "https://pub-abc.r2.dev",
  r2AccountId: "acct123",
};

describe("buildContentSecurityPolicy", () => {
  it("carries the request's nonce and no inline-script escape hatch", () => {
    const script = directives(buildContentSecurityPolicy(BASE)).get("script-src")!;
    expect(script).toContain("'nonce-TESTNONCE'");
    expect(script).toContain("'self'");
    // The entire value of the header. A single 'unsafe-inline' here would let
    // any injected <script> run and make the rest of this file decorative.
    expect(script).not.toContain("'unsafe-inline'");
  });

  it("never sends 'unsafe-eval' outside development", () => {
    expect(buildContentSecurityPolicy(BASE)).not.toContain("'unsafe-eval'");
    expect(
      buildContentSecurityPolicy({ ...BASE, isDev: true }),
    ).toContain("'unsafe-eval'");
  });

  it("allows ffmpeg's WebAssembly and its same-origin worker", () => {
    const d = directives(buildContentSecurityPolicy(BASE));
    expect(d.get("script-src")).toContain("'wasm-unsafe-eval'");
    expect(d.get("worker-src")).toEqual(["'self'", "blob:"]);
    // Safari has no worker-src and falls back to child-src.
    expect(d.get("child-src")).toEqual(["'self'", "blob:"]);
  });

  it("keeps style-src inline-capable and free of any nonce", () => {
    const style = directives(buildContentSecurityPolicy(BASE)).get("style-src")!;
    expect(style).toContain("'unsafe-inline'");
    // A nonce in this directive makes the browser ignore 'unsafe-inline', and
    // 26 components pass a style={{…}} prop that no nonce can cover.
    expect(style.some((value) => value.startsWith("'nonce-"))).toBe(false);
  });

  it("lets the browser reach Supabase, over https and over websockets", () => {
    const connect = directives(buildContentSecurityPolicy(BASE)).get("connect-src")!;
    expect(connect).toContain("https://pktdpxpafycyqiusvyhq.supabase.co");
    expect(connect).toContain("wss://pktdpxpafycyqiusvyhq.supabase.co");
  });

  it("lets the browser PUT to our own R2 account and read published media", () => {
    const connect = directives(buildContentSecurityPolicy(BASE)).get("connect-src")!;
    expect(connect).toContain("https://acct123.r2.cloudflarestorage.com");
    expect(connect).toContain("https://pub-abc.r2.dev");
    // Never the wildcard: a compromised page must not be able to ship bytes
    // into a stranger's bucket.
    expect(connect).not.toContain("https://*.r2.cloudflarestorage.com");
  });

  it("omits what is not configured rather than emitting an empty source", () => {
    const policy = buildContentSecurityPolicy({ nonce: "N" });
    expect(policy).not.toContain("r2.cloudflarestorage.com");
    expect(policy).not.toContain("supabase");
    expect(policy).not.toMatch(/;\s*;/);
    expect(policy).not.toMatch(/\s\s/);
  });

  it("survives a malformed configured URL instead of emitting a broken directive", () => {
    const policy = buildContentSecurityPolicy({
      nonce: "N",
      supabaseUrl: "not a url",
      r2PublicBaseUrl: "",
    });
    expect(directives(policy).get("connect-src")).toEqual([
      "'self'",
      "blob:",
      "data:",
    ]);
  });

  it("allows Stripe's hosted checkout and portal as form targets", () => {
    const form = directives(buildContentSecurityPolicy(BASE)).get("form-action")!;
    expect(form).toEqual([
      "'self'",
      "https://checkout.stripe.com",
      "https://billing.stripe.com",
    ]);
  });

  it("allows platform image CDNs but never a foreign script origin", () => {
    const d = directives(buildContentSecurityPolicy(BASE));
    expect(d.get("img-src")).toContain("https:");
    expect(d.get("media-src")).toContain("https:");
    expect(d.get("script-src")).not.toContain("https:");
    expect(d.get("default-src")).toEqual(["'self'"]);
  });

  it("locks down the directives that have no legitimate use here", () => {
    const d = directives(buildContentSecurityPolicy(BASE));
    expect(d.get("object-src")).toEqual(["'none'"]);
    expect(d.get("base-uri")).toEqual(["'self'"]);
    // Agrees with the X-Frame-Options: SAMEORIGIN that Caddy sends.
    expect(d.get("frame-ancestors")).toEqual(["'self'"]);
  });

  it("upgrades insecure requests in production only", () => {
    expect(buildContentSecurityPolicy(BASE)).toContain("upgrade-insecure-requests");
    expect(
      buildContentSecurityPolicy({ ...BASE, isDev: true }),
    ).not.toContain("upgrade-insecure-requests");
  });
});

describe("originOf", () => {
  it("keeps the origin and drops everything after it", () => {
    expect(originOf("https://example.com/a/b?c=d")).toBe("https://example.com");
  });

  it("answers null for anything unusable", () => {
    expect(originOf(undefined)).toBeNull();
    expect(originOf("")).toBeNull();
    expect(originOf("nonsense")).toBeNull();
  });
});

describe("generateNonce", () => {
  it("is unguessable per request", () => {
    const seen = new Set(Array.from({ length: 200 }, () => generateNonce()));
    expect(seen.size).toBe(200);
    // 16 bytes of CSPRNG, base64.
    expect([...seen][0]).toMatch(/^[A-Za-z0-9+/]{22}==$/);
  });
});
