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
export class PlatformApiError extends Error {
  readonly retryable: boolean;
  constructor(platform: string, detail: string, retryable = false) {
    super(`${platform}: ${detail}`);
    this.name = "PlatformApiError";
    this.retryable = retryable;
  }
}

export class PlatformNotRegisteredError extends Error {
  constructor(platform: string) {
    super(`No adapter registered for platform "${platform}"`);
    this.name = "PlatformNotRegisteredError";
  }
}
