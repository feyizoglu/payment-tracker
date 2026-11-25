import type { supabaseAdmin } from "@/lib/supabase";
import { sendExpoPush, type PushMessage } from "@/lib/push";
import { sendWebPush, type WebPushResult } from "@/lib/web-push";

type Db = ReturnType<typeof supabaseAdmin>;

export const WORDS_REMINDER_TITLE = "📖 Kelimelerim";
export const WORDS_REMINDER_URL = "/words/review";
// The phone app reads this to open the review screen.
export const WORDS_REMINDER_SCREEN = "words-review";
const PAGE = 1000;

export const wordsReminderBody = (count: number) => `Tekrar bekleyen ${count} kelimen var. Bir tur yapalım mı?`;

export interface WordsReminderSummary {
  users: number;
  push: { sent: number; invalidTokens: string[]; errors: string[] };
  webPush: WebPushResult;
  errors: string[];
}

/** How many unlearned words each user has; read in pages, as the API returns at most 1000 rows. */
async function unlearnedByUser(db: Db, errors: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from("vocab_words")
      .select("user_id")
      .is("learned_at", null)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) {
      errors.push(`vocab words query failed: ${error.message}`);
      break;
    }
    for (const row of data ?? []) counts.set(row.user_id, (counts.get(row.user_id) ?? 0) + 1);
    if (!data || data.length < PAGE) break;
  }
  return counts;
}

/** The daily nudge to review My Words, sent to every user with an unlearned word. */
export async function sendWordsReminders(db: Db): Promise<WordsReminderSummary> {
  const summary: WordsReminderSummary = {
    users: 0,
    push: { sent: 0, invalidTokens: [], errors: [] },
    webPush: { sent: 0, expiredEndpoints: [], errors: [] },
    errors: [],
  };
  const counts = await unlearnedByUser(db, summary.errors);
  const userIds = [...counts.keys()];
  summary.users = userIds.length;
  if (userIds.length === 0) return summary;

  const { data: devices, error: devicesError } = await db
    .from("devices")
    .select("user_id, expo_push_token")
    .in("user_id", userIds);
  if (devicesError) summary.push.errors.push(`devices query failed: ${devicesError.message}`);
  const messages: PushMessage[] = (devices ?? []).map((d) => ({
    to: d.expo_push_token,
    title: WORDS_REMINDER_TITLE,
    body: wordsReminderBody(counts.get(d.user_id) ?? 0),
    data: { screen: WORDS_REMINDER_SCREEN },
  }));
  const expo = await sendExpoPush(messages);
  summary.push = { sent: expo.sent, invalidTokens: expo.invalidTokens, errors: [...summary.push.errors, ...expo.errors] };
  if (expo.invalidTokens.length > 0) {
    const { error } = await db.from("devices").delete().in("expo_push_token", expo.invalidTokens);
    if (error) summary.push.errors.push(`dead-token prune failed: ${error.message}`);
  }

  const { data: subscriptions, error: subscriptionsError } = await db
    .from("web_push_subscriptions")
    .select("user_id, endpoint, p256dh, auth")
    .in("user_id", userIds);
  if (subscriptionsError) summary.webPush.errors.push(`web push subscriptions query failed: ${subscriptionsError.message}`);
  const byUser = new Map<string, { endpoint: string; p256dh: string; auth: string }[]>();
  for (const sub of subscriptions ?? []) {
    byUser.set(sub.user_id, [...(byUser.get(sub.user_id) ?? []), { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth }]);
  }
  for (const [userId, subs] of byUser) {
    const result = await sendWebPush(subs, {
      title: WORDS_REMINDER_TITLE,
      body: wordsReminderBody(counts.get(userId) ?? 0),
      url: WORDS_REMINDER_URL,
    });
    summary.webPush.sent += result.sent;
    summary.webPush.expiredEndpoints.push(...result.expiredEndpoints);
    for (const e of result.errors) if (!summary.webPush.errors.includes(e)) summary.webPush.errors.push(e);
  }
  if (summary.webPush.expiredEndpoints.length > 0) {
    const { error } = await db.from("web_push_subscriptions").delete().in("endpoint", summary.webPush.expiredEndpoints);
    if (error) summary.webPush.errors.push(`expired web push prune failed: ${error.message}`);
  }
  return summary;
}
