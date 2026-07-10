export type PushStatusKind =
  | "unsupported"
  | "dev-disabled"
  | "ios-not-installed"
  | "default"
  | "enabled"
  | "needs-repair"
  | "denied"
  | "error";

export interface PushStatusInput {
  supported: boolean;
  permission: NotificationPermission;
  isIOS: boolean;
  isStandalone: boolean;
  browserSubscribed: boolean;
  serverSubscribed: boolean;
  error?: string | null;
}

export function derivePushStatusKind(input: PushStatusInput): PushStatusKind {
  if (input.error) return "error";
  if (!input.supported) return "unsupported";
  if (input.isIOS && !input.isStandalone) return "ios-not-installed";
  if (input.permission === "denied") return "denied";
  if (input.permission === "granted") {
    return input.browserSubscribed && input.serverSubscribed ? "enabled" : "needs-repair";
  }
  return "default";
}
