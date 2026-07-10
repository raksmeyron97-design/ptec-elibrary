"use client";

import {
  PUSH_ERROR_CODES,
  type PushErrorCode,
  type SerializedPushSubscription,
  validateSerializedSubscription,
} from "@/lib/push-utils";
import { derivePushStatusKind, type PushStatusKind } from "@/lib/push-status";

export const PUSH_ONBOARDING_KEYS = {
  seen: "pwa_notification_onboarding_seen",
  completed: "pwa_notification_onboarding_completed",
  dismissedAt: "pwa_notification_onboarding_dismissed_at",
  installedAt: "ptec_pwa_installed_at",
  lastSyncAt: "ptec_push_last_sync_at",
} as const;

const SERVICE_WORKER_READY_TIMEOUT_MS = 6000;
const AUTO_SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000;

type NavigatorWithStandalone = Navigator & { standalone?: boolean };

export type PushStatus = {
  kind: PushStatusKind;
  supported: boolean;
  permission: NotificationPermission;
  isIOS: boolean;
  isStandalone: boolean;
  browserSubscribed: boolean;
  serverSubscribed: boolean;
  activeSubscriptions: number;
  endpoint: string | null;
  error: string | null;
  code: PushErrorCode | null;
};

type StatusApiResponse = {
  ok?: boolean;
  endpointSubscribed?: boolean;
  activeSubscriptions?: number;
  vapidPublicKeyConfigured?: boolean;
  error?: string;
  code?: PushErrorCode;
};

export function isNotificationSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof Notification !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    window.isSecureContext
  );
}

export function isIOSDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent.toLowerCase();
  return /iphone|ipad|ipod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function isStandaloneMode(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as NavigatorWithStandalone).standalone === true
  );
}

export function getNotificationPermission(): NotificationPermission {
  if (typeof Notification === "undefined") return "default";
  return Notification.permission;
}

export function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return new Uint8Array(Array.from(rawData, (char) => char.charCodeAt(0)));
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, code: PushErrorCode): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new PushClientError(code, "Service worker is not ready.")), timeoutMs);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export class PushClientError extends Error {
  code: PushErrorCode;

  constructor(code: PushErrorCode, message: string) {
    super(message);
    this.name = "PushClientError";
    this.code = code;
  }
}

export async function getServiceWorkerRegistration(): Promise<ServiceWorkerRegistration> {
  if (!("serviceWorker" in navigator)) {
    throw new PushClientError(PUSH_ERROR_CODES.UNSUPPORTED, "Service workers are not supported.");
  }

  const registration = await navigator.serviceWorker.getRegistration("/");
  if (registration) return registration;

  // Serwist is disabled in development (next.config.ts), so no sw.js is ever
  // registered — waiting on .ready would only hang until the timeout.
  if (process.env.NODE_ENV === "development") {
    throw new PushClientError(
      PUSH_ERROR_CODES.SW_REGISTRATION_FAILED,
      "The service worker is disabled in development. Run a production build (npm run build && npm start) to test push notifications.",
    );
  }

  return withTimeout(navigator.serviceWorker.ready, SERVICE_WORKER_READY_TIMEOUT_MS, PUSH_ERROR_CODES.SW_REGISTRATION_FAILED);
}

export async function getExistingPushSubscription(): Promise<PushSubscription | null> {
  if (!isNotificationSupported()) return null;
  const registration = await getServiceWorkerRegistration();
  return registration.pushManager.getSubscription();
}

export function serializeSubscription(subscription: PushSubscription): SerializedPushSubscription {
  const json = subscription.toJSON();
  const parsed = validateSerializedSubscription({
    endpoint: subscription.endpoint,
    keys: json.keys,
  });

  if (!parsed.ok || !parsed.data) {
    throw new PushClientError(parsed.code ?? PUSH_ERROR_CODES.INVALID_SUBSCRIPTION, "The browser returned an invalid subscription.");
  }

  return parsed.data;
}

export async function syncSubscriptionWithServer(
  subscription: PushSubscription,
  signal?: AbortSignal,
): Promise<void> {
  const serialized = serializeSubscription(subscription);
  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(serialized),
    signal,
  });
  const data = await res.json().catch(() => ({} as StatusApiResponse));
  if (!res.ok) {
    throw new PushClientError(data.code ?? PUSH_ERROR_CODES.SUBSCRIPTION_SYNC_FAILED, data.error ?? "Could not save subscription.");
  }
  window.localStorage.setItem(PUSH_ONBOARDING_KEYS.lastSyncAt, String(Date.now()));
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!isNotificationSupported()) {
    throw new PushClientError(PUSH_ERROR_CODES.UNSUPPORTED, "Notifications are not supported.");
  }
  if (Notification.permission === "granted") return "granted";
  return Notification.requestPermission();
}

export async function subscribeToPush(signal?: AbortSignal): Promise<PushSubscription> {
  if (!isNotificationSupported()) {
    throw new PushClientError(PUSH_ERROR_CODES.UNSUPPORTED, "Notifications are not supported.");
  }
  if (Notification.permission !== "granted") {
    throw new PushClientError(PUSH_ERROR_CODES.PERMISSION_DENIED, "Notification permission is not granted.");
  }

  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidKey) {
    throw new PushClientError(PUSH_ERROR_CODES.VAPID_CONFIG_MISSING, "Push notifications are not configured.");
  }

  const registration = await getServiceWorkerRegistration();
  const existing = await registration.pushManager.getSubscription();
  if (existing) {
    await syncSubscriptionWithServer(existing, signal);
    return existing;
  }

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidKey),
  });

  await syncSubscriptionWithServer(subscription, signal);
  return subscription;
}

export async function enablePushNotifications(signal?: AbortSignal): Promise<NotificationPermission> {
  const permission = await requestNotificationPermission();
  if (permission !== "granted") return permission;
  await subscribeToPush(signal);
  window.localStorage.setItem(PUSH_ONBOARDING_KEYS.completed, "true");
  return permission;
}

export async function repairPushSubscription(signal?: AbortSignal): Promise<void> {
  await subscribeToPush(signal);
}

export async function unsubscribeFromPush(signal?: AbortSignal): Promise<void> {
  const subscription = await getExistingPushSubscription();
  if (!subscription) return;

  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  await fetch("/api/push/unsubscribe", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint }),
    signal,
  }).catch(() => null);
  window.localStorage.removeItem(PUSH_ONBOARDING_KEYS.lastSyncAt);
}

export async function sendTestNotification(endpoint: string | null, signal?: AbortSignal): Promise<void> {
  const res = await fetch("/api/push/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint }),
    signal,
  });
  const data = await res.json().catch(() => ({} as StatusApiResponse));
  if (!res.ok) {
    throw new PushClientError(data.code ?? PUSH_ERROR_CODES.PUSH_SEND_FAILED, data.error ?? "Could not send a test notification.");
  }
}

async function getServerStatus(endpoint: string | null, signal?: AbortSignal): Promise<StatusApiResponse> {
  const params = endpoint ? `?endpoint=${encodeURIComponent(endpoint)}` : "";
  const res = await fetch(`/api/push/status${params}`, { signal });
  const data = await res.json().catch(() => ({} as StatusApiResponse));
  if (res.status === 401) {
    return { ok: false, endpointSubscribed: false, activeSubscriptions: 0, error: "Authentication required.", code: PUSH_ERROR_CODES.UNAUTHORIZED };
  }
  if (!res.ok) {
    return { ok: false, endpointSubscribed: false, activeSubscriptions: 0, error: data.error ?? "Could not load push status.", code: data.code };
  }
  return data;
}

export async function getNotificationStatus(signal?: AbortSignal): Promise<PushStatus> {
  const supported = isNotificationSupported();
  const permission = getNotificationPermission();
  const isIOS = isIOSDevice();
  const isStandalone = isStandaloneMode();

  if (!supported) {
    return {
      kind: "unsupported",
      supported: false,
      permission,
      isIOS,
      isStandalone,
      browserSubscribed: false,
      serverSubscribed: false,
      activeSubscriptions: 0,
      endpoint: null,
      error: null,
      code: null,
    };
  }

  let subscription: PushSubscription | null = null;
  let endpoint: string | null = null;
  let error: string | null = null;
  let code: PushErrorCode | null = null;

  try {
    subscription = await getExistingPushSubscription();
    endpoint = subscription?.endpoint ?? null;
  } catch (err) {
    // Expected in `next dev` (Serwist is disabled): report it as an
    // informational state, not an error, and skip the server round-trip.
    if (
      process.env.NODE_ENV === "development" &&
      err instanceof PushClientError &&
      err.code === PUSH_ERROR_CODES.SW_REGISTRATION_FAILED
    ) {
      return {
        kind: "dev-disabled",
        supported,
        permission,
        isIOS,
        isStandalone,
        browserSubscribed: false,
        serverSubscribed: false,
        activeSubscriptions: 0,
        endpoint: null,
        error: err.message,
        code: null,
      };
    }
    error = err instanceof Error ? err.message : "Could not read browser subscription.";
    code = err instanceof PushClientError ? err.code : PUSH_ERROR_CODES.SW_REGISTRATION_FAILED;
  }

  const server = await getServerStatus(endpoint, signal);
  if (server.code === PUSH_ERROR_CODES.UNAUTHORIZED) {
    code = PUSH_ERROR_CODES.UNAUTHORIZED;
  } else if (server.error) {
    error = server.error;
    code = server.code ?? PUSH_ERROR_CODES.SUBSCRIPTION_SYNC_FAILED;
  }

  const browserSubscribed = !!subscription;
  const serverSubscribed = !!server.endpointSubscribed;
  const kind = derivePushStatusKind({
    supported,
    permission,
    isIOS,
    isStandalone,
    browserSubscribed,
    serverSubscribed,
    error,
  });

  return {
    kind,
    supported,
    permission,
    isIOS,
    isStandalone,
    browserSubscribed,
    serverSubscribed,
    activeSubscriptions: server.activeSubscriptions ?? 0,
    endpoint,
    error,
    code,
  };
}

export function shouldAutoSync(): boolean {
  const raw = window.localStorage.getItem(PUSH_ONBOARDING_KEYS.lastSyncAt);
  const lastSync = raw ? Number(raw) : 0;
  return !Number.isFinite(lastSync) || Date.now() - lastSync > AUTO_SYNC_INTERVAL_MS;
}
