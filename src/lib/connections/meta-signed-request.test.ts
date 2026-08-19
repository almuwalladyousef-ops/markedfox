import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { parseSignedRequest, verifyMetaSignedRequest } from "./meta-signed-request";

// Meta's deauthorize and data-deletion callbacks are public endpoints that
// delete data. The only thing standing between a forged POST and someone
// else's connections is this verification.

function sign(payload: object, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${sig}.${body}`;
}

describe("parseSignedRequest", () => {
  it("returns the payload for a correctly signed request", () => {
    const signed = sign({ user_id: "12345", algorithm: "HMAC-SHA256" }, "s3cret");
    expect(parseSignedRequest(signed, "s3cret")).toEqual({
      user_id: "12345",
      algorithm: "HMAC-SHA256",
    });
  });

  it("rejects a wrong secret, a tampered payload, and garbage", () => {
    const signed = sign({ user_id: "12345" }, "s3cret");
    expect(parseSignedRequest(signed, "other")).toBeNull();

    const [sig] = signed.split(".");
    const tampered = `${sig}.${Buffer.from(JSON.stringify({ user_id: "99999" })).toString("base64url")}`;
    expect(parseSignedRequest(tampered, "s3cret")).toBeNull();

    expect(parseSignedRequest("nodot", "s3cret")).toBeNull();
    expect(parseSignedRequest("", "s3cret")).toBeNull();
    expect(parseSignedRequest(".", "s3cret")).toBeNull();
  });

  it("rejects a valid signature over a non-object payload", () => {
    const body = Buffer.from(JSON.stringify("just a string")).toString("base64url");
    const sig = createHmac("sha256", "s3cret").update(body).digest("base64url");
    expect(parseSignedRequest(`${sig}.${body}`, "s3cret")).toBeNull();
  });
});

describe("verifyMetaSignedRequest", () => {
  const secrets = { meta: "meta-secret", threads: "threads-secret" };

  it("identifies which product signed the request", () => {
    expect(verifyMetaSignedRequest(sign({ user_id: "1" }, "meta-secret"), secrets)).toEqual({
      payload: { user_id: "1" },
      app: "meta",
    });
    expect(verifyMetaSignedRequest(sign({ user_id: "2" }, "threads-secret"), secrets)).toEqual({
      payload: { user_id: "2" },
      app: "threads",
    });
  });

  it("returns null when neither secret verifies, or when none is configured", () => {
    expect(verifyMetaSignedRequest(sign({ user_id: "1" }, "someone-else"), secrets)).toBeNull();
    expect(verifyMetaSignedRequest(sign({ user_id: "1" }, "meta-secret"), {})).toBeNull();
  });

  it("skips a product whose secret is not configured rather than failing", () => {
    expect(
      verifyMetaSignedRequest(sign({ user_id: "2" }, "threads-secret"), { threads: "threads-secret" }),
    ).toEqual({ payload: { user_id: "2" }, app: "threads" });
  });
});
