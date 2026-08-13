export class NotImplementedError extends Error {
  constructor(feature: string) {
    super(`Not implemented: ${feature}`);
    this.name = "NotImplementedError";
  }
}

export class PlatformNotRegisteredError extends Error {
  constructor(platform: string) {
    super(`No adapter registered for platform "${platform}"`);
    this.name = "PlatformNotRegisteredError";
  }
}
