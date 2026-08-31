import { describe, expect, it, vi } from "vitest";

import { consumeAll, consumeRateLimit, resetRateLimit } from "./limit";

/** A Supabase double that records rpc calls and replays queued answers. */
function fakeClient(
  answers: { data?: unknown; error?: { message: string } }[] = [],
) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  let index = 0;
  return {
    calls,
    rpc: vi.fn(async (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      return answers[index++] ?? { data: [{ allowed: true, retry_after_seconds: 0, remaining: 5 }] };
    }),
  };
}

const client = (c: ReturnType<typeof fakeClient>) =>
  c as unknown as Parameters<typeof consumeRateLimit>[2];

describe("consumeRateLimit", () => {
  it("passes the policy's own numbers to the database", async () => {
    const fake = fakeClient();
    await consumeRateLimit("signInEmail", "a@b.com", client(fake));

    expect(fake.calls[0].fn).toBe("consume_rate_limit");
    expect(fake.calls[0].args).toMatchObject({
      p_key: "signInEmail:a@b.com",
      p_limit: 8,
      p_window_seconds: 300,
      p_cost: 1,
    });
  });

  it("refuses with the policy's wording and a retry time", async () => {
    const fake = fakeClient([
      { data: [{ allowed: false, retry_after_seconds: 42, remaining: 0 }] },
    ]);
    const verdict = await consumeRateLimit("signInEmail", "a@b.com", client(fake));

    expect(verdict.allowed).toBe(false);
    expect(verdict.retryAfterSeconds).toBe(42);
    expect(verdict.message).toMatch(/try again/i);
  });

  it("spends nothing when there is no subject to count", async () => {
    const fake = fakeClient();
    const verdict = await consumeRateLimit("signInIp", null, client(fake));

    expect(verdict.allowed).toBe(true);
    expect(fake.rpc).not.toHaveBeenCalled();
  });

  // The deliberate trade, and the one worth pinning: a limiter that fails
  // closed turns a database blip into "nobody can sign in", which is a worse
  // outage than the abuse it prevents. RLS is what fails closed, not this.
  it("fails OPEN when the database cannot answer", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const fake = fakeClient([{ error: { message: "connection refused" } }]);

    const verdict = await consumeRateLimit("signInEmail", "a@b.com", client(fake));

    expect(verdict.allowed).toBe(true);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  // The env vars are read when the service client is built, and requireEnv
  // THROWS. Built outside the try that throw escapes a limiter documented to
  // fail open — a deployment missing SUPABASE_SECRET_KEY would not be
  // "unlimited sign-ins", it would be "no sign-ins at all".
  it("fails open when building the client itself throws", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const exploding = {
      rpc: () => {
        throw new Error("SUPABASE_SECRET_KEY is not set");
      },
    };

    const verdict = await consumeRateLimit(
      "signInEmail",
      "a@b.com",
      exploding as unknown as Parameters<typeof consumeRateLimit>[2],
    );

    expect(verdict.allowed).toBe(true);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it("fails open on a malformed answer too", async () => {
    const fake = fakeClient([{ data: [] }]);
    const verdict = await consumeRateLimit("signInEmail", "a@b.com", client(fake));
    expect(verdict.allowed).toBe(true);
  });
});

describe("consumeAll", () => {
  it("returns the first refusal", async () => {
    const fake = fakeClient([
      { data: [{ allowed: true, retry_after_seconds: 0, remaining: 3 }] },
      { data: [{ allowed: false, retry_after_seconds: 60, remaining: 0 }] },
    ]);

    const verdict = await consumeAll(
      [
        { name: "signInEmail", subject: "a@b.com" },
        { name: "signInIp", subject: "203.0.113.7" },
      ],
      client(fake),
    );

    expect(verdict.allowed).toBe(false);
    expect(verdict.retryAfterSeconds).toBe(60);
  });

  // If a tripped per-email limit short-circuited the per-IP one, an attacker
  // could park one address at its ceiling and guess other addresses free.
  it("consumes every policy even after one has already refused", async () => {
    const fake = fakeClient([
      { data: [{ allowed: false, retry_after_seconds: 30, remaining: 0 }] },
      { data: [{ allowed: true, retry_after_seconds: 0, remaining: 9 }] },
    ]);

    await consumeAll(
      [
        { name: "signInEmail", subject: "a@b.com" },
        { name: "signInIp", subject: "203.0.113.7" },
      ],
      client(fake),
    );

    expect(fake.rpc).toHaveBeenCalledTimes(2);
  });

  it("allows when every policy allows", async () => {
    const fake = fakeClient();
    const verdict = await consumeAll(
      [{ name: "signUpIp", subject: "203.0.113.7" }],
      client(fake),
    );
    expect(verdict.allowed).toBe(true);
  });
});

describe("resetRateLimit", () => {
  it("clears the key a correct password earned back", async () => {
    const fake = fakeClient();
    await resetRateLimit("signInEmail", "a@b.com", client(fake));

    expect(fake.calls[0]).toEqual({
      fn: "reset_rate_limit",
      args: { p_key: "signInEmail:a@b.com" },
    });
  });

  it("never throws out of a reset, however the client misbehaves", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const exploding = {
      rpc: () => {
        throw new Error("connection refused");
      },
    };

    await expect(
      resetRateLimit(
        "signInEmail",
        "a@b.com",
        exploding as unknown as Parameters<typeof resetRateLimit>[2],
      ),
    ).resolves.toBeUndefined();

    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it("does nothing without a subject", async () => {
    const fake = fakeClient();
    await resetRateLimit("signInEmail", null, client(fake));
    expect(fake.rpc).not.toHaveBeenCalled();
  });
});
