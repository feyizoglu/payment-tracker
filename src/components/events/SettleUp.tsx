"use client";

import { useState } from "react";
import type { EventDetail } from "@/types";
import { balances, formatMinor, parseDecimalToMinor, participantLabel, suggestTransfers, type Transfer } from "@/lib/split";
import { useLang } from "@/lib/i18n";

export default function SettleUp({
  event,
  isOpen,
  onChanged,
}: {
  event: EventDetail;
  isOpen: boolean;
  onChanged: () => void;
}) {
  const { t } = useLang();
  const [busy, setBusy] = useState<string | null>(null);
  const [partial, setPartial] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const name = (id: string) => {
    const p = event.participants.find((x) => x.id === id);
    return p ? participantLabel(p) : "?";
  };
  const b = balances(event.expenses, event.settlements);
  const transfers = suggestTransfers(b);
  const key = (tr: Transfer) => `${tr.currency}:${tr.from}:${tr.to}`;

  async function failed(res: Response) {
    const data = await res.json().catch(() => null);
    setError(typeof data?.error === "string" ? data.error : t.updateFailed);
  }

  async function record(tr: Transfer) {
    if (busy) return;
    const k = key(tr);
    const typed = partial[k]?.trim();
    const amount = typed ? parseDecimalToMinor(typed) : tr.amount_minor;
    if (amount === null || amount <= 0 || amount > tr.amount_minor) {
      setError(t.invalidAmount);
      return;
    }
    setBusy(k);
    setError(null);
    try {
      const res = await fetch(`/api/events/${event.id}/settlements`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ from_participant: tr.from, to_participant: tr.to, amount_minor: amount, currency: tr.currency }),
      });
      if (!res.ok) {
        await failed(res);
        return;
      }
      setPartial((prev) => {
        const next = { ...prev };
        delete next[k];
        return next;
      });
      onChanged();
    } catch {
      setError(t.updateFailed);
    } finally {
      setBusy(null);
    }
  }

  async function undo(id: string) {
    if (busy) return;
    if (!window.confirm(t.undoPaymentConfirm)) return;
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/events/${event.id}/settlements/${id}`, { method: "DELETE" });
      if (!res.ok) {
        await failed(res);
        return;
      }
      onChanged();
    } catch {
      setError(t.updateFailed);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <section>
        <h3 className="font-semibold text-gray-800 mb-2">{t.balancesTitle}</h3>
        {Object.entries(b).map(([currency, row]) => (
          <div key={currency} className="mb-2">
            {Object.entries(row)
              .filter(([, v]) => v !== 0)
              .map(([pid, v]) => (
                <div key={pid} className="flex justify-between text-sm">
                  <span>{name(pid)}</span>
                  <span className={v > 0 ? "text-green-600" : "text-red-600"}>{formatMinor(v, currency, t.numberLocale)}</span>
                </div>
              ))}
          </div>
        ))}
      </section>
      <section>
        <h3 className="font-semibold text-gray-800 mb-2">{t.settleUp}</h3>
        {transfers.length === 0 ? <p className="text-sm text-gray-400">{t.allSettled}</p> : null}
        {transfers.map((tr) => (
          <div key={key(tr)} className="flex items-center gap-2 text-sm py-1">
            <span className="flex-1">
              {name(tr.from)} → {name(tr.to)}: <b>{formatMinor(tr.amount_minor, tr.currency, t.numberLocale)}</b>
            </span>
            {isOpen && (
              <>
                <input
                  inputMode="decimal"
                  placeholder={(tr.amount_minor / 100).toString()}
                  value={partial[key(tr)] ?? ""}
                  onChange={(e) => setPartial({ ...partial, [key(tr)]: e.target.value })}
                  className="w-24 rounded-lg border border-gray-200 px-2 py-1"
                />
                <button
                  disabled={busy !== null}
                  onClick={() => record(tr)}
                  className="rounded-lg bg-green-600 px-3 py-1 text-white disabled:opacity-50">
                  {t.markPaid}
                </button>
              </>
            )}
          </div>
        ))}
      </section>
      {event.settlements.length ? (
        <section>
          <h3 className="font-semibold text-gray-800 mb-2">{t.payments}</h3>
          {event.settlements.map((s) => (
            <div key={s.id} className="flex justify-between text-sm py-1">
              <span>
                {name(s.from_participant)} → {name(s.to_participant)}: {formatMinor(s.amount_minor, s.currency, t.numberLocale)}
              </span>
              {isOpen && (
                <button
                  disabled={busy !== null}
                  onClick={() => undo(s.id)}
                  className="text-gray-400 hover:text-red-600 disabled:opacity-50">
                  {t.undo}
                </button>
              )}
            </div>
          ))}
        </section>
      ) : null}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
