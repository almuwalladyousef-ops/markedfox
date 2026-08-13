export class MissingEnvError extends Error {
  constructor(name: string) {
    super(
      `Missing required environment variable ${name}. ` +
        `See .env.example for every variable this app needs.`,
    );
    this.name = "MissingEnvError";
  }
}

// Read env at call time, never at module scope: `next build` must stay green
// with zero environment variables set.
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new MissingEnvError(name);
  }
  return value;
}
