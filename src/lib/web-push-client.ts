import { signOut } from "next-auth/react";

export const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC ?? "";

export function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export async function deleteWebPushSubscription(endpoint: string): Promise<void> {
  await fetch("/api/web-push", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ endpoint }),
  });
}

async function unsubscribeThisBrowser(): Promise<void> {
  try {
    if (!("serviceWorker" in navigator)) return;
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager?.getSubscription();
    if (!subscription) return;
    await deleteWebPushSubscription(subscription.endpoint).catch(() => {});
    await subscription.unsubscribe();
  } catch {
    // Best effort: sign-out must still happen.
  }
}

export async function signOutWithPushCleanup(): Promise<void> {
  await unsubscribeThisBrowser();
  await signOut({ callbackUrl: "/" });
}
