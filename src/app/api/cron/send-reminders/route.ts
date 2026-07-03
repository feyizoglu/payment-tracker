import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getInstallments, recurringOccurrencesInRange, getCurrencySymbol } from "@/lib/payments";
import { Payment, RecurringPayment, User } from "@/types";
import { Resend } from "resend";
import { addDays, format } from "date-fns";
import { sendExpoPush, type PushMessage } from "@/lib/push";

export const dynamic = "force-dynamic";

type DueItem = {
  paymentName: string;
  installmentNumber: number;
  totalInstallments: number;
  amount: number | null;
  currency: string;
  isRecurring?: boolean;
};

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = supabaseAdmin();
  const resend = new Resend(process.env.RESEND_API_KEY);

  // Tomorrow's local date components — cron fires at 12:00 UTC = 15:00 Turkey (UTC+3)
  const tomorrow = addDays(new Date(), 1);
  const tYear = tomorrow.getFullYear();
  const tMonth = tomorrow.getMonth();
  const tDay = tomorrow.getDate();
  const tomorrowStr = format(tomorrow, "dd MMMM yyyy");

  const { data: payments, error } = await db
    .from("payments")
    .select("*, overrides:payment_overrides(*), user:users!payments_user_id_fkey(id, name, email)");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const dueByUser = new Map<string, { user: User; items: DueItem[] }>();

  for (const raw of (payments ?? []) as (Payment & { user: User })[]) {
    if (raw.paid_installments >= raw.total_installments) continue;
    if (!raw.user?.email) continue;

    const installments = getInstallments(raw);
    for (const inst of installments) {
      if (inst.isPaid) continue;
      const d = inst.dueDate;
      if (d.getFullYear() === tYear && d.getMonth() === tMonth && d.getDate() === tDay) {
        if (!dueByUser.has(raw.user_id)) {
          dueByUser.set(raw.user_id, { user: raw.user, items: [] });
        }
        dueByUser.get(raw.user_id)!.items.push({
          paymentName: raw.name,
          installmentNumber: inst.index + 1,
          totalInstallments: raw.total_installments,
          amount: inst.amount,
          currency: raw.currency ?? "TRY",
        });
        break; // one reminder per payment
      }
    }
  }

  // Recurring reminders due tomorrow
  const { data: recurrings } = await db
    .from("recurring_payments")
    .select("*, entries:recurring_entries(*), user:users!recurring_payments_user_id_fkey(id, name, email)");

  const dayStart = new Date(tYear, tMonth, tDay, 0, 0, 0, 0);
  const dayEnd = new Date(tYear, tMonth, tDay, 23, 59, 59, 999);

  for (const r of (recurrings ?? []) as (RecurringPayment & { user: User })[]) {
    if (!r.user?.email) continue;
    for (const occ of recurringOccurrencesInRange(r, dayStart, dayEnd)) {
      if (occ.isPaid) continue;
      if (!dueByUser.has(r.user_id)) {
        dueByUser.set(r.user_id, { user: r.user, items: [] });
      }
      dueByUser.get(r.user_id)!.items.push({
        paymentName: r.name,
        installmentNumber: 0,
        totalInstallments: 0,
        amount: occ.amount,
        currency: r.currency ?? "TRY",
        isRecurring: true,
      });
    }
  }

  // Push notifications to registered devices (in addition to email)
  let pushSummary = { sent: 0, invalidTokens: [] as string[], errors: [] as string[] };
  const dueUserIds = [...dueByUser.keys()];
  if (dueUserIds.length > 0) {
    const { data: devices, error: devicesError } = await db
      .from("devices")
      .select("user_id, expo_push_token")
      .in("user_id", dueUserIds);

    if (devicesError) {
      // Surface a query failure so a broken push pipeline is distinguishable
      // from a quiet day (no devices) in the response/logs.
      pushSummary.errors.push(`devices query failed: ${devicesError.message}`);
    }

    const messages: PushMessage[] = [];
    for (const device of devices ?? []) {
      const due = dueByUser.get(device.user_id);
      if (!due) continue;
      const lines = due.items.map((item) => {
        const tutar =
          item.amount == null
            ? ""
            : ` — ${getCurrencySymbol(item.currency)}${new Intl.NumberFormat("tr-TR", {
                minimumFractionDigits: 2,
              }).format(item.amount)}`;
        return `${item.paymentName}${tutar}`;
      });
      messages.push({
        to: device.expo_push_token,
        title: "Ödeme Hatırlatıcısı",
        body: `Yarın (${tomorrowStr}) vadesi dolan: ${lines.join(", ")}`,
        data: { month: format(tomorrow, "yyyy-MM") },
      });
    }

    const expoResult = await sendExpoPush(messages);
    // Merge (don't overwrite): keep any devices-query error recorded above.
    pushSummary = {
      sent: expoResult.sent,
      invalidTokens: expoResult.invalidTokens,
      errors: [...pushSummary.errors, ...expoResult.errors],
    };
    if (pushSummary.invalidTokens.length > 0) {
      const { error: pruneError } = await db
        .from("devices")
        .delete()
        .in("expo_push_token", pushSummary.invalidTokens);
      if (pruneError) {
        // Surface a failed prune so dead tokens aren't silently re-sent every run.
        pushSummary.errors.push(`dead-token prune failed: ${pruneError.message}`);
      }
    }
  }

  const results: { email: string; status: string }[] = [];

  for (const [, { user, items }] of dueByUser) {
    const rows = items
      .map((item) => {
        const taksit = item.isRecurring ? "—" : `${item.installmentNumber}/${item.totalInstallments}`;
        const tutar = item.amount == null
          ? "—"
          : `${getCurrencySymbol(item.currency)}${new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2 }).format(item.amount)}`;
        return `<tr>
            <td style="padding:8px 12px;border-bottom:1px solid #eee;">${item.paymentName}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;">${taksit}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;">${tutar}</td>
          </tr>`;
      })
      .join("");

    const html = `
      <div style="font-family:sans-serif;max-width:540px;margin:0 auto;color:#1a1a1a;">
        <h2 style="margin-bottom:4px;">Ödeme Hatırlatıcısı</h2>
        <p style="color:#555;margin-top:0;">Aşağıdaki ödeme(ler) <strong>yarın, ${tomorrowStr}</strong> tarihinde vadesi dolmaktadır.</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          <thead>
            <tr style="background:#f5f5f5;">
              <th style="padding:8px 12px;text-align:left;">Ödeme</th>
              <th style="padding:8px 12px;text-align:center;">Taksit</th>
              <th style="padding:8px 12px;text-align:right;">Tutar</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <p style="color:#888;font-size:12px;margin-top:24px;">Payment Tracker tarafından gönderildi</p>
      </div>
    `;

    const { error: sendError } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL ?? "Payment Tracker <onboarding@resend.dev>",
      to: user.email,
      subject: `Ödeme hatırlatıcısı — ${tomorrowStr}`,
      html,
    });

    results.push({
      email: user.email,
      status: sendError ? `error: ${(sendError as any).message}` : "sent",
    });
  }

  return NextResponse.json({
    date: format(tomorrow, "yyyy-MM-dd"),
    sent: results.length,
    results,
    push: pushSummary,
  });
}
