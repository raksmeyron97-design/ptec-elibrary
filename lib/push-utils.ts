export const PUSH_ERROR_CODES = {
  UNSUPPORTED: "PUSH_UNSUPPORTED",
  SW_REGISTRATION_FAILED: "SW_REGISTRATION_FAILED",
  PERMISSION_DENIED: "PERMISSION_DENIED",
  SUBSCRIPTION_FAILED: "SUBSCRIPTION_FAILED",
  SUBSCRIPTION_SYNC_FAILED: "SUBSCRIPTION_SYNC_FAILED",
  PUSH_SEND_FAILED: "PUSH_SEND_FAILED",
  INVALID_SUBSCRIPTION: "INVALID_SUBSCRIPTION",
  VAPID_CONFIG_MISSING: "VAPID_CONFIG_MISSING",
  UNAUTHORIZED: "UNAUTHORIZED",
  RATE_LIMITED: "RATE_LIMITED",
} as const;

export type PushErrorCode = (typeof PUSH_ERROR_CODES)[keyof typeof PUSH_ERROR_CODES];

export type PushNotificationType =
  | "NEW_BOOK"
  | "NEW_ANNOUNCEMENT"
  | "TEST"
  | "BROADCAST"
  | "NEW_PUBLICATION";

export interface SerializedPushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface PushPayload {
  type?: PushNotificationType;
  title: string;
  body: string;
  url?: string;
  icon?: string;
  badge?: string;
  tag?: string;
  entityId?: string;
  eventId?: string;
}

export interface PushValidationResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
  code?: PushErrorCode;
}

const MAX_ENDPOINT_LENGTH = 2048;
const MAX_KEY_LENGTH = 512;
const MAX_TITLE_LENGTH = 120;
const MAX_BODY_LENGTH = 500;
const MAX_URL_LENGTH = 2000;
const MAX_EVENT_ID_LENGTH = 160;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function cleanString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) return null;
  return trimmed;
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function isReasonablePushKey(value: string): boolean {
  return /^[A-Za-z0-9_-]+={0,2}$/.test(value);
}

export function validateSerializedSubscription(input: unknown): PushValidationResult<SerializedPushSubscription> {
  if (!isRecord(input)) {
    return { ok: false, error: "Invalid subscription.", code: PUSH_ERROR_CODES.INVALID_SUBSCRIPTION };
  }

  const endpoint = cleanString(input.endpoint, MAX_ENDPOINT_LENGTH);
  const keys = input.keys;
  if (!endpoint || !isHttpsUrl(endpoint) || !isRecord(keys)) {
    return { ok: false, error: "Invalid subscription.", code: PUSH_ERROR_CODES.INVALID_SUBSCRIPTION };
  }

  const p256dh = cleanString(keys.p256dh, MAX_KEY_LENGTH);
  const auth = cleanString(keys.auth, MAX_KEY_LENGTH);
  if (!p256dh || !auth || !isReasonablePushKey(p256dh) || !isReasonablePushKey(auth)) {
    return { ok: false, error: "Invalid subscription keys.", code: PUSH_ERROR_CODES.INVALID_SUBSCRIPTION };
  }

  return { ok: true, data: { endpoint, keys: { p256dh, auth } } };
}

export function safeInternalUrl(input: unknown, fallback = "/"): string {
  if (typeof input !== "string") return fallback;
  const trimmed = input.trim();
  if (!trimmed || trimmed.length > MAX_URL_LENGTH) return fallback;
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return trimmed;
  return fallback;
}

export function validatePushPayload(input: unknown): PushValidationResult<PushPayload> {
  if (!isRecord(input)) {
    return { ok: false, error: "Invalid push payload.", code: PUSH_ERROR_CODES.PUSH_SEND_FAILED };
  }

  const title = cleanString(input.title, MAX_TITLE_LENGTH);
  const body = cleanString(input.body, MAX_BODY_LENGTH);
  if (!title || !body) {
    return { ok: false, error: "title and body are required.", code: PUSH_ERROR_CODES.PUSH_SEND_FAILED };
  }

  const payload: PushPayload = {
    title,
    body,
    url: safeInternalUrl(input.url),
  };

  if (typeof input.type === "string" && input.type.length <= 40) {
    payload.type = input.type as PushNotificationType;
  }
  if (typeof input.icon === "string" && input.icon.startsWith("/") && input.icon.length <= MAX_URL_LENGTH) {
    payload.icon = input.icon;
  }
  if (typeof input.badge === "string" && input.badge.startsWith("/") && input.badge.length <= MAX_URL_LENGTH) {
    payload.badge = input.badge;
  }
  if (typeof input.tag === "string" && input.tag.trim().length <= 120) {
    payload.tag = input.tag.trim();
  }
  if (typeof input.entityId === "string" && input.entityId.trim().length <= MAX_EVENT_ID_LENGTH) {
    payload.entityId = input.entityId.trim();
  }
  if (typeof input.eventId === "string" && input.eventId.trim().length <= MAX_EVENT_ID_LENGTH) {
    payload.eventId = input.eventId.trim();
  }

  return { ok: true, data: payload };
}

export function maskEndpoint(endpoint: string): string {
  if (endpoint.length <= 24) return "[redacted]";
  return `${endpoint.slice(0, 12)}...${endpoint.slice(-8)}`;
}

export function shouldNotifyPublishedTransition(
  previousStatus: string | null | undefined,
  nextStatus: string | null | undefined,
): boolean {
  return previousStatus !== "published" && nextStatus === "published";
}
