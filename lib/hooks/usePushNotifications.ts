"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  enablePushNotifications,
  getNotificationStatus,
  repairPushSubscription,
  sendTestNotification,
  shouldAutoSync,
  unsubscribeFromPush,
  type PushStatus,
  PushClientError,
} from "@/lib/push-client";
import { PUSH_ERROR_CODES, type PushErrorCode } from "@/lib/push-utils";

const INITIAL_STATUS: PushStatus = {
  kind: "unsupported",
  supported: false,
  permission: "default",
  isIOS: false,
  isStandalone: false,
  browserSubscribed: false,
  serverSubscribed: false,
  activeSubscriptions: 0,
  endpoint: null,
  error: null,
  code: null,
};

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === "AbortError";
}

type PushAction = "enable" | "repair" | "disable" | "test";
type PushMessageKey =
  | "successEnabled"
  | "successPermissionUnchanged"
  | "successRepaired"
  | "successDisabled"
  | "successTestSent";

export function usePushNotifications(options: { autoRepair?: boolean } = {}) {
  const [status, setStatus] = useState<PushStatus>(INITIAL_STATUS);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<PushAction | null>(null);
  const [messageKey, setMessageKey] = useState<PushMessageKey | null>(null);
  const [errorCode, setErrorCode] = useState<PushErrorCode | null>(null);
  const actionRef = useRef(false);
  const autoRepairRef = useRef(false);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const next = await getNotificationStatus(signal);
      if (signal?.aborted) return;
      setStatus(next);
      setErrorCode(next.code);
    } catch (err) {
      if (signal?.aborted || isAbortError(err)) return;
      const code = err instanceof PushClientError ? err.code : PUSH_ERROR_CODES.SUBSCRIPTION_FAILED;
      setErrorCode(code);
      setStatus((prev) => ({
        ...prev,
        kind: "error",
        error: err instanceof Error ? err.message : "Could not load push status.",
        code,
      }));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);

  useEffect(() => {
    if (!options.autoRepair || autoRepairRef.current) return;
    if (status.permission !== "granted" || status.kind !== "needs-repair") return;
    if (status.code === PUSH_ERROR_CODES.UNAUTHORIZED) return;
    if (!status.isStandalone || !shouldAutoSync()) return;

    autoRepairRef.current = true;
    const controller = new AbortController();
    void repairPushSubscription(controller.signal)
      .then(() => refresh(controller.signal))
      .catch((err) => {
        if (controller.signal.aborted || isAbortError(err)) return;
        const code = err instanceof PushClientError ? err.code : PUSH_ERROR_CODES.SUBSCRIPTION_FAILED;
        setErrorCode(code);
        setStatus((prev) => ({ ...prev, kind: "error", error: "Could not repair notifications.", code }));
      });

    return () => controller.abort();
  }, [options.autoRepair, refresh, status.code, status.isStandalone, status.kind, status.permission]);

  const runAction = useCallback(async (action: PushAction, work: (signal: AbortSignal) => Promise<PushMessageKey | null>) => {
    if (actionRef.current) return;
    actionRef.current = true;
    const controller = new AbortController();
    setBusyAction(action);
    setMessageKey(null);
    setErrorCode(null);

    try {
      const nextMessage = await work(controller.signal);
      setMessageKey(nextMessage);
      await refresh(controller.signal);
    } catch (err) {
      const code = err instanceof PushClientError ? err.code : PUSH_ERROR_CODES.SUBSCRIPTION_FAILED;
      setErrorCode(code);
      setStatus((prev) => ({
        ...prev,
        kind: "error",
        error: err instanceof Error ? err.message : "Push notification action failed.",
        code,
      }));
    } finally {
      actionRef.current = false;
      setBusyAction(null);
    }
  }, [refresh]);

  const enable = useCallback(() => runAction("enable", async (signal) => {
    const permission = await enablePushNotifications(signal);
    if (permission === "granted") return "successEnabled";
    if (permission === "denied") throw new PushClientError(PUSH_ERROR_CODES.PERMISSION_DENIED, "Notification permission is blocked.");
    return "successPermissionUnchanged";
  }), [runAction]);

  const repair = useCallback(() => runAction("repair", async (signal) => {
    await repairPushSubscription(signal);
    return "successRepaired";
  }), [runAction]);

  const disable = useCallback(() => runAction("disable", async (signal) => {
    await unsubscribeFromPush(signal);
    return "successDisabled";
  }), [runAction]);

  const test = useCallback(() => runAction("test", async (signal) => {
    await sendTestNotification(status.endpoint, signal);
    return "successTestSent";
  }), [runAction, status.endpoint]);

  return {
    status,
    loading,
    busyAction,
    messageKey,
    errorCode,
    refresh,
    enable,
    repair,
    disable,
    test,
  };
}
