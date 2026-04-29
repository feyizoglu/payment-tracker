import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getInstallments, getCurrencySymbol } from "@/lib/payments";
import { Payment, User } from "@/types";
import { Resend } from "resend";
import { addDays, format } from "date-fns";

export const dynamic = "force-dynamic";

type DueItem = {
  paymentName: string;
  installmentNumber: number;
  totalInstallments: number;
  amount: number;
  currency: string;
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

  const { data: payments, error } = await db
    .from("payments")
    .select("*, user:users!payments_user_id_fkey(id, name, email)");

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

  const results: { email: string; status: string }[] = [];

  for (const [, { user, items }] of dueByUser) {
    const tomorrowStr = format(tomorrow, "dd MMMM yyyy");

    const rows = items
      .map(
        (item) =>
          `<tr>
            <td style="padding:8px 12px;border-bottom:1px solid #eee;">${item.paymentName}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;">${item.installmentNumber}/${item.totalInstallments}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;">${getCurrencySymbol(item.currency)}${new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2 }).format(item.amount)}</td>
          </tr>`
      )
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
  });
}
