import webpush from "web-push";

export interface WebPushSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface WebPushPayload {
  title: string;
  body: string;
  url: string;
}

export interface WebPushResult {
  sent: number;
  expiredEndpoints: string[];
  errors: string[];
}

export async function sendWebPush(
  subscriptions: WebPushSubscription[],
  payload: WebPushPayload
): Promise<WebPushResult> {
  const result: WebPushResult = { sent: 0, expiredEndpoints: [], errors: [] };
  if (subscriptions.length === 0) return result;

  const subject = process.env.VAPID_SUBJECT;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!subject || !publicKey || !privateKey) {
    result.errors.push("VAPID env not configured");
    return result;
  }

  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
  } catch (e) {
    result.errors.push(e instanceof Error ? e.message : "invalid VAPID details");
    return result;
  }

  const body = JSON.stringify(payload);
  for (const s of subscriptions) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body);
      result.sent += 1;
    } catch (e) {
      const status = (e as { statusCode?: number } | null)?.statusCode;
      if (status === 404 || status === 410) {
        result.expiredEndpoints.push(s.endpoint);
      } else {
        result.errors.push(e instanceof Error ? e.message : "unknown web push error");
      }
    }
  }

  return result;
}
