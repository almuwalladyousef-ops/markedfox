export { NotImplementedError, PlatformNotRegisteredError } from "./errors";
export { getPlatform, listRegisteredPlatforms } from "./registry";
export { PLATFORMS } from "./types";
export type {
  ConnectionTokens,
  ConnectResult,
  MediaRef,
  Platform,
  PlatformAdapter,
  PlatformCapabilities,
  PublishInput,
  PublishResult,
} from "./types";
