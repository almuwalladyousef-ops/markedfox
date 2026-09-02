import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

function repoFile(relative: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../../../${relative}`, import.meta.url)),
    "utf8",
  );
}

// These are one-line settings that nothing else would notice the loss of, and
// each of them is a finding if it goes missing.
describe("security configuration", () => {
  it("does not announce the framework in every response", () => {
    expect(repoFile("next.config.ts")).toMatch(/poweredByHeader:\s*false/);
  });

  it("sends the policy on the response and the nonce into the render", () => {
    const proxy = repoFile("src/proxy.ts");
    // Only the response header is enforced by the browser; only the request
    // header lets Next stamp its own inline scripts. Losing either breaks a
    // different half.
    expect(proxy).toContain('response.headers.set("content-security-policy", csp)');
    expect(proxy).toContain('"x-nonce": nonce');
  });

  it("refuses an unhandled method before it reaches the framework", () => {
    const proxy = repoFile("src/proxy.ts");
    expect(proxy).toContain("isAllowedMethod(request.method)");
    expect(proxy).toContain("status: 405");
    expect(proxy).toContain("allow: ALLOW_HEADER");
  });

  it("labels the one inline script the app writes itself", () => {
    const layout = repoFile("src/app/layout.tsx");
    expect(layout).toContain("nonce={nonce}");
    expect(layout).toContain('headers()).get("x-nonce")');
  });
});

// The edge half of the same guard. TRACE never reaches middleware — Next throws
// while building the request object — so this is the only place that answers it.
describe("Caddy", () => {
  it("refuses unsupported methods with a 405 and an Allow header", () => {
    const caddyfile = repoFile("deploy/Caddyfile");
    expect(caddyfile).toContain(
      "not method GET HEAD POST PUT PATCH DELETE OPTIONS",
    );
    expect(caddyfile).toContain(
      'header @unsupported_method Allow "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS"',
    );
    expect(caddyfile).toContain('respond @unsupported_method "Method Not Allowed" 405');
  });

  it("still lets the webhooks POST and the browser preflight", () => {
    const caddyfile = repoFile("deploy/Caddyfile");
    const guard = /not method ([A-Z ]+)/.exec(caddyfile)![1].trim().split(" ");
    // Stripe and Meta both POST; a CORS preflight is an OPTIONS.
    expect(guard).toContain("POST");
    expect(guard).toContain("OPTIONS");
  });
});
