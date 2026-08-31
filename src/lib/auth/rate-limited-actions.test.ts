import { beforeEach, describe, expect, it, vi } from "vitest";

// Integration cover for the rate limiting WIRED INTO the auth actions.
//
// policy.test.ts pins the numbers and limit.test.ts pins the enforcement, but
// neither would notice if the actions simply never called them — which is the
// state this code was in before, and the state a careless refactor returns it
// to. So this exercises the real exported actions with the Supabase client,
// the request headers and the limiter itself stood in for.
//
// What it proves: a normal sign-in reaches Supabase, a refused one does NOT,
// a correct password clears the counter, and a rate-limited password reset
// still answers with the same generic line as a successful one — the limit
// must not become an account-existence oracle.

const signInWithPassword = vi.fn();
const signUpMock = vi.fn();
const resetPasswordForEmail = vi.fn();
const consumeAll = vi.fn();
const resetRateLimit = vi.fn();

vi.mock("server-only", () => ({}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.7" }),
}));

// redirect() throws in Next so control never falls through it; the double
// does the same so a successful sign-in is distinguishable from a refused one.
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      signInWithPassword,
      signUp: signUpMock,
      resetPasswordForEmail,
    },
  }),
}));

vi.mock("@/lib/auth/site-url", () => ({
  getSiteUrl: async () => "https://markedfox.com",
}));

vi.mock("@/lib/rate-limit/limit", () => ({
  consumeAll,
  resetRateLimit,
  consumeRateLimit: vi.fn(),
}));

const ALLOW = { allowed: true, retryAfterSeconds: 0, remaining: 5, message: null };
const REFUSE = {
  allowed: false,
  retryAfterSeconds: 90,
  remaining: 0,
  message: "Too many sign-in attempts. Wait a moment and try again.",
};

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

const CREDENTIALS = { email: "person@example.com", password: "Str0ng-passw0rd!" };

beforeEach(() => {
  vi.clearAllMocks();
  consumeAll.mockResolvedValue(ALLOW);
  signInWithPassword.mockResolvedValue({ error: null });
  signUpMock.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
  resetPasswordForEmail.mockResolvedValue({ error: null });
});

describe("signIn", () => {
  it("checks the email and the network before trying the password", async () => {
    const { signIn } = await import("./actions");
    await expect(signIn({}, form(CREDENTIALS))).rejects.toThrow(/REDIRECT:/);

    expect(consumeAll).toHaveBeenCalledTimes(1);
    expect(consumeAll.mock.calls[0][0]).toEqual([
      { name: "signInEmail", subject: CREDENTIALS.email },
      { name: "signInIp", subject: "203.0.113.7" },
    ]);
  });

  // The point of the limiter: a refused attempt must not reach the password
  // check at all, or it is not costing an attacker anything.
  it("never calls Supabase once the limit is hit", async () => {
    consumeAll.mockResolvedValue(REFUSE);
    const { signIn } = await import("./actions");

    const state = await signIn({}, form(CREDENTIALS));

    expect(signInWithPassword).not.toHaveBeenCalled();
    expect(state.message).toBe(REFUSE.message);
  });

  it("forgives the attempts once the password is right", async () => {
    const { signIn } = await import("./actions");
    await expect(signIn({}, form(CREDENTIALS))).rejects.toThrow(/REDIRECT:/);

    expect(resetRateLimit).toHaveBeenCalledWith("signInEmail", CREDENTIALS.email);
  });

  it("leaves the counter spent when the password was wrong", async () => {
    signInWithPassword.mockResolvedValue({ error: { message: "bad" } });
    const { signIn } = await import("./actions");

    const state = await signIn({}, form(CREDENTIALS));

    expect(resetRateLimit).not.toHaveBeenCalled();
    // Still the one generic message — the limiter must not have turned this
    // into an oracle that distinguishes wrong password from unknown account.
    expect(state.message).toBe("That email and password combination did not work.");
  });
});

describe("signUp", () => {
  it("limits by network before creating an account", async () => {
    const { signUp } = await import("./actions");
    await signUp({}, form(CREDENTIALS));

    expect(consumeAll.mock.calls[0][0]).toEqual([
      { name: "signUpIp", subject: "203.0.113.7" },
    ]);
    expect(signUpMock).toHaveBeenCalled();
  });

  it("sends no confirmation mail once the limit is hit", async () => {
    consumeAll.mockResolvedValue({ ...REFUSE, message: "Too many accounts created." });
    const { signUp } = await import("./actions");

    const state = await signUp({}, form(CREDENTIALS));

    expect(signUpMock).not.toHaveBeenCalled();
    expect(state.message).toBe("Too many accounts created.");
  });
});

describe("requestPasswordReset", () => {
  it("limits by address and by network", async () => {
    const { requestPasswordReset } = await import("./actions");
    await requestPasswordReset({}, form({ email: CREDENTIALS.email }));

    expect(consumeAll.mock.calls[0][0]).toEqual([
      { name: "passwordResetEmail", subject: CREDENTIALS.email },
      { name: "passwordResetIp", subject: "203.0.113.7" },
    ]);
    expect(resetPasswordForEmail).toHaveBeenCalled();
  });

  // The refusal has to look like the success, or the limit itself tells an
  // attacker which addresses are registered.
  it("still answers as a success, and sends nothing", async () => {
    consumeAll.mockResolvedValue({
      ...REFUSE,
      message: "A reset link was already sent. Check your inbox, or try again later.",
    });
    const { requestPasswordReset } = await import("./actions");

    const state = await requestPasswordReset({}, form({ email: CREDENTIALS.email }));

    expect(resetPasswordForEmail).not.toHaveBeenCalled();
    expect(state.success).toBe(true);
    expect(state.message).toMatch(/check your inbox|try again later/i);
  });
});
