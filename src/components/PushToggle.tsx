"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { useLang } from "@/lib/i18n";
import {
  VAPID_PUBLIC_KEY,
  deleteWebPushSubscription,
  urlBase64ToUint8Array,
} from "@/lib/web-push-client";

type PushState = "hidden" | "ios-hint" | "off" | "on";

function isIosBrowserTab(): boolean {
  const ios =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return ios && !standalone;
}

// The server row is keyed by endpoint and owned by whoever posted it last, so posting
// the browser's subscription again hands it to the account signed in now.
async function saveSubscription(subscription: PushSubscription): Promise<boolean> {
  try {
    const res = await fetch("/api/web-push", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(subscription.toJSON()),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function pushSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export default function PushToggle() {
  const { t } = useLang();
  const [state, setState] = useState<PushState>("hidden");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      if (!VAPID_PUBLIC_KEY) return;
      // iOS Safari only exposes PushManager once the site runs from the home screen.
      if (isIosBrowserTab()) {
        if (!cancelled) setState("ios-hint");
        return;
      }
      if (!pushSupported()) return;
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
          updateViaCache: "none",
        });
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) await saveSubscription(subscription);
        if (!cancelled) setState(subscription ? "on" : "off");
      } catch {
        // Leave the bell hidden when the service worker cannot be registered.
      }
    };
    void init();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state === "hidden") return null;

  async function subscribe() {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      if (permission === "denied") setMessage(t.remindersBlocked);
      return;
    }
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
    if (!(await saveSubscription(subscription))) {
      await subscription.unsubscribe();
      throw new Error("subscribe failed");
    }
    setState("on");
  }

  async function unsubscribe() {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await subscription.unsubscribe();
      await deleteWebPushSubscription(subscription.endpoint).catch(() => {});
    }
    setState("off");
  }

  async function handleClick() {
    if (state === "ios-hint") {
      setMessage((m) => (m ? null : t.iosInstallHint));
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      if (state === "on") await unsubscribe();
      else await subscribe();
    } catch {
      setMessage(t.remindersFailed);
    } finally {
      setBusy(false);
    }
  }

  const on = state === "on";
  const label = on ? t.disableReminders : t.enableReminders;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        aria-label={label}
        aria-pressed={state === "ios-hint" ? undefined : on}
        title={label}
        className={`p-1.5 rounded-lg border transition disabled:opacity-50 ${
          on
            ? "border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100"
            : "border-gray-200 text-gray-500 hover:bg-gray-50"
        }`}
      >
        {on ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
      </button>
      {message && (
        <div
          role="status"
          className="absolute right-0 top-full mt-2 w-64 bg-white rounded-xl shadow-lg border border-gray-100 p-3 text-xs text-gray-700 z-50"
        >
          {message}
        </div>
      )}
    </div>
  );
}
