export class NotImplementedError extends Error {
  constructor(feature: string) {
    super(`Not implemented: ${feature}`);
    this.name = "NotImplementedError";
  }
}

// The platform rejected our credentials: expired/revoked token, wrong secret.
// Callers mark the connection `expired` and ask the user to reconnect —
// retrying is pointless.
export class PlatformAuthError extends Error {
  constructor(platform: string, detail: string) {
    super(`${platform}: ${detail}`);
    this.name = "PlatformAuthError";
  }
}

// Any other platform API failure. `retryable` hints whether the job queue
// should back off and try again (rate limits, 5xx) or dead-letter it.
//
// `status` and `retryAfterSeconds` are optional and exist for one job: telling
// a genuine rate-limit refusal apart from every other failure, so the shared
// per-app budget can be told to stop before the platform escalates. Adapters
// that do not carry them simply do not participate.
export class PlatformApiError extends Error {
  readonly retryable: boolean;
  readonly status?: number;
  readonly retryAfterSeconds?: number;

  constructor(
    platform: string,
    detail: string,
    retryable = false,
    options: { status?: number; retryAfterSeconds?: number } = {},
  ) {
    super(`${platform}: ${detail}`);
    this.name = "PlatformApiError";
    this.retryable = retryable;
    this.status = options.status;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }
}

export class PlatformNotRegisteredError extends Error {
  constructor(platform: string) {
    super(`No adapter registered for platform "${platform}"`);
    this.name = "PlatformNotRegisteredError";
  }
}
