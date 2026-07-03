export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export interface PushResult {
  sent: number;
  invalidTokens: string[];
  errors: string[];
}

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const CHUNK_SIZE = 100; // Expo push API accepts up to 100 messages per request

export async function sendExpoPush(messages: PushMessage[]): Promise<PushResult> {
  const result: PushResult = { sent: 0, invalidTokens: [], errors: [] };

  for (let i = 0; i < messages.length; i += CHUNK_SIZE) {
    const chunk = messages.slice(i, i + CHUNK_SIZE);
    let res: Response;
    try {
      res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(chunk),
      });
    } catch (e) {
      result.errors.push(e instanceof Error ? e.message : "network error");
      continue;
    }
    if (!res.ok) {
      result.errors.push(`HTTP ${res.status}`);
      continue;
    }
    const json = await res.json().catch(() => null);
    const data = json?.data;
    if (!Array.isArray(data)) {
      // A 2xx with a missing/non-array `data` means a corrupted or unexpected
      // response — surface it instead of silently reporting nothing.
      result.errors.push("malformed response body");
      continue;
    }
    const tickets = data as Array<{
      status: string;
      message?: string;
      details?: { error?: string };
    }>;
    tickets.forEach((ticket, idx) => {
      if (idx >= chunk.length) return; // guard against more tickets than messages sent
      if (ticket.status === "ok") {
        result.sent += 1;
        return;
      }
      if (ticket.details?.error === "DeviceNotRegistered") {
        result.invalidTokens.push(chunk[idx].to);
      }
      // A dead token also lands here, so it appears in both invalidTokens and errors.
      result.errors.push(ticket.message ?? "unknown push error");
    });
  }

  return result;
}
