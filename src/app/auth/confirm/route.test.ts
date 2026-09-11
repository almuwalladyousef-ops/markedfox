import { beforeEach, describe, expect, it, vi } from "vitest";

// The confirmation route must accept BOTH link shapes Supabase can send.
//
// Production ran for weeks with only the token_hash branch while the project's
// email templates were Supabase's defaults, which produce a `?code=` link — so
// every confirmation and password-reset email landed on
// /login?error=invalid_link. This pins that a code is exchanged, that a
// token_hash is verified, and that each failure names the right reason.

const verifyOtp = vi.fn();
const exchangeCodeForSession = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { verifyOtp, exchangeCodeForSession } }),
}));
vi.mock("@/lib/auth/site-url", () => ({
  getSiteUrl: async () => "https://markedfox.com",
}));

const { GET } = await import("./route");

function request(query: string) {
  const url = `http://127.0.0.1:3000/auth/confirm${query}`;
  return { nextUrl: new URL(url), url } as never;
}

async function location(query: string): Promise<string> {
  const res = await GET(request(query));
  expect(res.status).toBe(307);
  return res.headers.get("location") ?? "";
}

beforeEach(() => {
  verifyOtp.mockReset();
  exchangeCodeForSession.mockReset();
});

describe("PKCE code links (Supabase's default templates)", () => {
  it("exchanges the code and lands on the destination", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });
    expect(await location("?flow=recovery&code=abc&next=/update-password")).toBe(
      "https://markedfox.com/update-password",
    );
    expect(exchangeCodeForSession).toHaveBeenCalledWith("abc");
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it("names a missing verifier as the other-browser case", async () => {
    exchangeCodeForSession.mockResolvedValue({
      error: { code: "pkce_code_verifier_not_found", message: "PKCE code verifier not found in storage." },
    });
    expect(await location("?code=abc")).toBe(
      "https://markedfox.com/login?error=other_browser",
    );
  });

  it("tells a sign-up whose exchange failed that the email IS confirmed", async () => {
    // Supabase only redirects with a code after verifying the token, so the
    // account is confirmed even when this browser cannot take the session.
    exchangeCodeForSession.mockResolvedValue({
      error: { code: "pkce_code_verifier_not_found", message: "PKCE code verifier not found in storage." },
    });
    expect(await location("?flow=signup&code=abc")).toBe(
      "https://markedfox.com/login?error=confirmed",
    );
  });

  it("reports Supabase's own refusal as an expired link", async () => {
    expect(
      await location("?flow=signup&error=access_denied&error_code=otp_expired"),
    ).toBe("https://markedfox.com/login?error=expired_link");
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("treats any other exchange failure as a spent link", async () => {
    exchangeCodeForSession.mockResolvedValue({
      error: { code: "flow_state_not_found", message: "invalid flow state" },
    });
    expect(await location("?code=abc")).toBe(
      "https://markedfox.com/login?error=expired_link",
    );
  });

  it("builds every redirect on the public origin, never the request host", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });
    expect(await location("?code=abc")).toBe("https://markedfox.com/dashboard");
  });
});

describe("token_hash links (our templates)", () => {
  it("verifies the hash and lands on the destination", async () => {
    verifyOtp.mockResolvedValue({ error: null });
    expect(
      await location("?token_hash=h1&type=recovery&next=/update-password"),
    ).toBe("https://markedfox.com/update-password");
    expect(verifyOtp).toHaveBeenCalledWith({ type: "recovery", token_hash: "h1" });
  });

  it("refuses an unknown type as invalid", async () => {
    expect(await location("?token_hash=h1&type=sms")).toBe(
      "https://markedfox.com/login?error=invalid_link",
    );
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it("reports a spent hash as expired", async () => {
    verifyOtp.mockResolvedValue({ error: { message: "Token has expired or is invalid" } });
    expect(await location("?token_hash=h1&type=email")).toBe(
      "https://markedfox.com/login?error=expired_link",
    );
  });
});

describe("neither shape", () => {
  it("is invalid, and never touches Supabase", async () => {
    expect(await location("")).toBe("https://markedfox.com/login?error=invalid_link");
    expect(verifyOtp).not.toHaveBeenCalled();
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("keeps a crafted next on-site", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });
    expect(await location("?code=abc&next=//evil.com")).toBe(
      "https://markedfox.com/dashboard",
    );
  });
});
