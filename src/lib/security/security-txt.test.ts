import { describe, expect, it } from "vitest";

import { buildSecurityTxt, EXPIRY_DAYS, SECURITY_CONTACT } from "./security-txt";

const NOW = new Date("2026-09-02T00:00:00.000Z");

describe("buildSecurityTxt", () => {
  it("has the two fields RFC 9116 requires", () => {
    const text = buildSecurityTxt(NOW);
    expect(text).toContain(`Contact: ${SECURITY_CONTACT}`);
    expect(text).toMatch(/^Expires: \d{4}-\d{2}-\d{2}T/m);
  });

  it("expires inside a year, measured from the request", () => {
    const expires = new Date(
      /^Expires: (.+)$/m.exec(buildSecurityTxt(NOW))![1],
    );
    const days = (expires.getTime() - NOW.getTime()) / 86_400_000;
    expect(days).toBe(EXPIRY_DAYS);
    expect(days).toBeLessThan(365);
    expect(days).toBeGreaterThan(0);
  });

  it("never publishes the role account that owns the whole stack", () => {
    // markedfox.usa@gmail.com holds Meta, Supabase, the VPS and Cloudflare.
    // A security.txt is read by exactly the people who should not have it.
    expect(buildSecurityTxt(NOW)).not.toContain("gmail.com");
    expect(buildSecurityTxt(NOW)).not.toContain("markedfox.usa");
  });

  it("uses a contact the product already publishes", () => {
    expect(SECURITY_CONTACT).toBe("mailto:support@markedfox.com");
  });

  it("points its canonical at the site it was served from", () => {
    expect(buildSecurityTxt(NOW, "https://markedfox.com")).toContain(
      "Canonical: https://markedfox.com/.well-known/security.txt",
    );
    expect(buildSecurityTxt(NOW, "https://staging.example.com")).toContain(
      "Canonical: https://staging.example.com/.well-known/security.txt",
    );
  });
});
