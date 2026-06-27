# Recurring Aya Özel Tarih (Gün) Değiştirme — Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recurring (aylık tekrar eden) hatırlatıcıların belirli bir ayının tarihini/gününü, başka aya da taşınabilecek şekilde değiştirebilmek; takvimden bir modal ile.

**Architecture:** `recurring_entries`'e nullable `due_date` kolonu eklenir. Recurring occurrence toplama, "aya göre"den "efektif tarihe göre"ye çevrilir: yeni `recurringOccurrencesInRange` yardımcısı override'lı entry'leri (tarihi nereye düşerse) ve override'sız ayları (varsayılan gün) birlikte üretir; `getOccurrencesForMonth/InRange` ve e-posta cron'u bunu kullanır. Düzenleme, taksitlerin modalı genelleştirilerek (`EditOccurrenceModal`) yapılır.

**Tech Stack:** Next.js 16 (App Router, `force-dynamic`), React 19, TypeScript, Supabase (service-role), date-fns, Tailwind, vitest.

**Spec:** `docs/superpowers/specs/2026-06-27-recurring-date-override-design.md`

> ⚠️ **Next.js notu (AGENTS.md):** Route konvansiyonu için mevcut `src/app/api/recurring/[id]/entry/route.ts`'i referans al.

---

### Task 1: Veritabanı şeması

**Files:**
- Modify: `supabase-schema.sql`

- [ ] **Step 1: due_date kolonunu ekle**

`supabase-schema.sql` içinde, `recurring_entries` tablosunu oluşturan `create table ... recurring_entries (...)` bloğundan **sonra** (mevcut `alter table ... add column` desenleriyle aynı bölge, örn. `currency` alter'ının yakını) ekle:

```sql
-- due_date column for recurring entries (per-month date override; added after initial schema)
alter table recurring_entries add column if not exists due_date date;
```

- [ ] **Step 2: Migration manuel — SKIP (insan Supabase'de çalıştıracak). Sadece dosyayı düzenle.**

- [ ] **Step 3: Commit**

```bash
git add supabase-schema.sql
git commit -m "feat(db): add due_date to recurring_entries"
```

---

### Task 2: Tipler + mevcut test literali düzeltmesi

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/lib/payments.test.ts`

- [ ] **Step 1: RecurringEntry'ye due_date ekle**

`src/types/index.ts` içindeki `RecurringEntry` interface'ini şu hale getir (yeni `due_date` alanı `paid_at`'ten sonra):

```ts
export interface RecurringEntry {
  id: string;
  recurring_id: string;
  period: string;            // 'yyyy-MM-01'
  amount: number | null;
  is_paid: boolean;
  paid_at: string | null;
  due_date: string | null;   // 'yyyy-MM-dd' | null
  created_at: string;
}
```

- [ ] **Step 2: Mevcut test entry literalini güncelle**

`due_date` artık zorunlu bir alan olduğundan, `src/lib/payments.test.ts`'teki mevcut entry literali tsc'yi kırar. Şu satırı:

```ts
        { id: "e1", recurring_id: "r1", period: "2026-07-01", amount: 5000, is_paid: true, paid_at: null, created_at: "" },
```

şununla değiştir (`due_date: null` ekle):

```ts
        { id: "e1", recurring_id: "r1", period: "2026-07-01", amount: 5000, is_paid: true, paid_at: null, due_date: null, created_at: "" },
```

- [ ] **Step 3: Tip kontrolü + testler**

Run: `npx tsc --noEmit` → hata yok.
Run: `npm test` → mevcut 12 test hâlâ geçmeli.

- [ ] **Step 4: Commit**

```bash
git add src/types/index.ts src/lib/payments.test.ts
git commit -m "feat(types): add due_date to RecurringEntry"
```

---

### Task 3: Lib — efektif-tarih tabanlı recurring toplama (TDD)

**Files:**
- Modify: `src/lib/payments.ts`
- Test: `src/lib/payments.test.ts`

- [ ] **Step 1: Başarısız testleri ekle**

`src/lib/payments.test.ts` dosyasının başındaki import'a `recurringOccurrencesInRange` ekle. Mevcut:
```ts
import {
  recurringOccurrenceForMonth,
  getOccurrencesForMonth,
  getOccurrencesInRange,
  getInstallments,
  getRemainingAmount,
} from "@/lib/payments";
```
şu hale getir:
```ts
import {
  recurringOccurrenceForMonth,
  getOccurrencesForMonth,
  getOccurrencesInRange,
  getInstallments,
  getRemainingAmount,
  recurringOccurrencesInRange,
} from "@/lib/payments";
```

Dosyanın sonuna ekle (`makeRecurring` helper'ı zaten mevcut):
```ts
describe("recurring date override", () => {
  it("uses entry.due_date as the occurrence date and flags overridden", () => {
    const r = makeRecurring({ day_of_month: 15, start_month: "2026-06-01",
      entries: [{ id: "e1", recurring_id: "r1", period: "2026-07-01", amount: null, is_paid: false, paid_at: null, due_date: "2026-07-22", created_at: "" }] });
    const occ = recurringOccurrenceForMonth(r, 2026, 6); // July
    expect(occ!.dueDate.getDate()).toBe(22);
    expect(occ!.overridden).toBe(true);
  });

  it("falls back to the default clamped day when no due_date", () => {
    const r = makeRecurring({ day_of_month: 15, start_month: "2026-06-01" });
    const occ = recurringOccurrenceForMonth(r, 2026, 6);
    expect(occ!.dueDate.getDate()).toBe(15);
    expect(!!occ!.overridden).toBe(false);
  });

  it("moves an occurrence to another month (period stays fixed)", () => {
    const r = makeRecurring({ day_of_month: 15, start_month: "2026-06-01",
      entries: [{ id: "e1", recurring_id: "r1", period: "2026-07-01", amount: 500, is_paid: false, paid_at: null, due_date: "2026-08-03", created_at: "" }] });
    // July no longer shows it (moved out)
    const july = getOccurrencesForMonth([], [r], 2026, 6);
    expect(july.some((o) => o.period === "2026-07-01")).toBe(false);
    // August shows it, but its period stays July
    const aug = getOccurrencesForMonth([], [r], 2026, 7);
    const moved = aug.find((o) => o.period === "2026-07-01");
    expect(moved).toBeTruthy();
    expect(moved!.dueDate.getDate()).toBe(3);
    expect(moved!.overridden).toBe(true);
    // And August's own default occurrence is also present (period Aug)
    expect(aug.some((o) => o.period === "2026-08-01")).toBe(true);
  });

  it("recurringOccurrencesInRange includes override + default occurrences in range", () => {
    const r = makeRecurring({ day_of_month: 10, start_month: "2026-06-01",
      entries: [{ id: "e1", recurring_id: "r1", period: "2026-07-01", amount: null, is_paid: false, paid_at: null, due_date: "2026-07-25", created_at: "" }] });
    const start = new Date(2026, 6, 1);   // 1 Jul
    const end = new Date(2026, 6, 31, 23, 59, 59, 999); // 31 Jul
    const occ = recurringOccurrencesInRange(r, start, end);
    expect(occ.length).toBe(1);
    expect(occ[0].dueDate.getDate()).toBe(25); // overridden, not default 10
  });
});
```

- [ ] **Step 2: Testleri çalıştır, FAIL doğrula**

Run: `npm test`
Expected: FAIL — `recurringOccurrencesInRange` export değil + override uygulanmıyor.

- [ ] **Step 3: `recurringOccurrenceForMonth`'ı override uygulayacak şekilde değiştir**

`src/lib/payments.ts` içindeki `recurringOccurrenceForMonth` fonksiyonunu tamamen şununla değiştir:

```ts
export function recurringOccurrenceForMonth(
  r: RecurringPayment,
  year: number,
  month: number
): Occurrence | null {
  const start = parseLocalDate(r.start_month);
  const startY = start.getFullYear();
  const startM = start.getMonth();
  if (year < startY || (year === startY && month < startM)) return null;

  if (r.end_month) {
    const end = parseLocalDate(r.end_month);
    const endY = end.getFullYear();
    const endM = end.getMonth();
    if (year > endY || (year === endY && month > endM)) return null;
  }

  const period = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const entry = r.entries?.find((e) => e.period === period);

  let dueDate = new Date(year, month, clampDay(year, month, r.day_of_month));
  let overridden = false;
  if (entry?.due_date) {
    const [oy, om, od] = entry.due_date.split("-").map(Number);
    dueDate = new Date(oy, om - 1, od);
    overridden = true;
  }

  return {
    kind: "recurring",
    sourceId: r.id,
    name: r.name,
    currency: r.currency ?? "TRY",
    user_id: r.user_id,
    team_id: r.team_id,
    dueDate,
    amount: entry?.amount ?? null,
    isPaid: entry?.is_paid ?? false,
    overridden,
    period,
    entryId: entry?.id ?? null,
  };
}
```

- [ ] **Step 4: `recurringOccurrencesInRange` ekle ve toplayıcıları yeniden yaz**

`recurringOccurrenceForMonth`'tan **sonra** ekle:

```ts
// All occurrences of a recurring payment whose effective dueDate falls within
// [start, end] (inclusive). Handles overrides that move a date to another month.
export function recurringOccurrencesInRange(
  r: RecurringPayment,
  start: Date,
  end: Date
): Occurrence[] {
  const out: Occurrence[] = [];
  const seenPeriods = new Set<string>();

  // 1. Entries with an explicit due_date override — wherever the date lands
  for (const e of r.entries ?? []) {
    if (!e.due_date) continue;
    seenPeriods.add(e.period);
    const [ey, em] = e.period.split("-").map(Number);
    const occ = recurringOccurrenceForMonth(r, ey, em - 1);
    if (occ && occ.dueDate >= start && occ.dueDate <= end) out.push(occ);
  }

  // 2. Default-day occurrences for each month in range without a due_date override
  let y = start.getFullYear();
  let m = start.getMonth();
  const endY = end.getFullYear();
  const endM = end.getMonth();
  while (y < endY || (y === endY && m <= endM)) {
    const period = `${y}-${String(m + 1).padStart(2, "0")}-01`;
    if (!seenPeriods.has(period)) {
      const occ = recurringOccurrenceForMonth(r, y, m);
      if (occ && occ.dueDate >= start && occ.dueDate <= end) out.push(occ);
    }
    m++;
    if (m > 11) { m = 0; y++; }
  }

  return out;
}
```

`getOccurrencesForMonth` fonksiyonunun **recurring döngüsünü** değiştir. Şu bloğu:
```ts
  for (const r of recurrings) {
    const occ = recurringOccurrenceForMonth(r, year, month);
    if (occ) result.push(occ);
  }
```
şununla değiştir:
```ts
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0);
  monthEnd.setHours(23, 59, 59, 999);
  for (const r of recurrings) {
    result.push(...recurringOccurrencesInRange(r, monthStart, monthEnd));
  }
```

`getOccurrencesInRange` fonksiyonundaki recurring `while` döngüsünü (aşağıdaki blok):
```ts
  let y = start.getFullYear();
  let m = start.getMonth();
  const endY = end.getFullYear();
  const endM = end.getMonth();
  while (y < endY || (y === endY && m <= endM)) {
    for (const r of recurrings) {
      const occ = recurringOccurrenceForMonth(r, y, m);
      if (occ && occ.dueDate >= start && occ.dueDate <= end) result.push(occ);
    }
    m++;
    if (m > 11) { m = 0; y++; }
  }
```
şununla değiştir:
```ts
  for (const r of recurrings) {
    result.push(...recurringOccurrencesInRange(r, start, end));
  }
```

- [ ] **Step 5: Testleri çalıştır, PASS doğrula**

Run: `npm test`
Expected: PASS (önceki 12 + yeni 4 = 16).
Run: `npx tsc --noEmit` → hata yok.

- [ ] **Step 6: Commit**

```bash
git add src/lib/payments.ts src/lib/payments.test.ts
git commit -m "feat(lib): effective-date recurring occurrence gathering with date override"
```

---

### Task 4: API — entry PUT `due_date` desteği

**Files:**
- Modify: `src/app/api/recurring/[id]/entry/route.ts`

- [ ] **Step 1: due_date'i payload'a ekle**

`src/app/api/recurring/[id]/entry/route.ts` içinde, `is_paid` bloğundan **sonra** (ve `upsert` çağrısından önce) ekle:

```ts
  if (body.due_date !== undefined) {
    payload.due_date = body.due_date ? String(body.due_date) : null;
  }
```

- [ ] **Step 2: Build kontrolü**

Run: `npx tsc --noEmit` → hata yok.

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/recurring/[id]/entry/route.ts"
git commit -m "feat(api): accept due_date in recurring entry upsert"
```

---

### Task 5: E-posta cron — tek-günlük aralık

**Files:**
- Modify: `src/app/api/cron/send-reminders/route.ts`

- [ ] **Step 1: Import'u güncelle**

Mevcut import satırını:
```ts
import { getInstallments, recurringOccurrenceForMonth, getCurrencySymbol } from "@/lib/payments";
```
şununla değiştir:
```ts
import { getInstallments, recurringOccurrencesInRange, getCurrencySymbol } from "@/lib/payments";
```

- [ ] **Step 2: Recurring tarama döngüsünü değiştir**

Mevcut bloğu:
```ts
  for (const r of (recurrings ?? []) as (RecurringPayment & { user: User })[]) {
    if (!r.user?.email) continue;
    const occ = recurringOccurrenceForMonth(r, tYear, tMonth);
    if (!occ) continue;
    if (occ.dueDate.getDate() !== tDay) continue;
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
```
şununla değiştir:
```ts
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
```

- [ ] **Step 3: Build kontrolü**

Run: `npx tsc --noEmit` → hata yok (eski `recurringOccurrenceForMonth` kullanımı kalmamalı; `tDay` artık `dayStart/dayEnd` üzerinden kullanılıyor).

- [ ] **Step 4: Commit**

```bash
git add src/app/api/cron/send-reminders/route.ts
git commit -m "feat(cron): match recurring reminders by effective date (single-day range)"
```

---

### Task 6: i18n metinleri

**Files:**
- Modify: `src/lib/i18n.tsx`

- [ ] **Step 1: EN bloğuna ekle**

EN bloğundaki `editedBadge: "edited",` satırından sonra ekle:
```ts
    editReminder: "Edit Reminder",
    resetDay: "Reset day",
```

- [ ] **Step 2: TR bloğuna ekle**

TR bloğundaki `editedBadge: "düzenlendi",` satırından sonra ekle:
```ts
    editReminder: "Hatırlatıcıyı Düzenle",
    resetDay: "Günü sıfırla",
```

- [ ] **Step 3: Tip kontrolü**

Run: `npx tsc --noEmit` → hata yok (iki blok aynı anahtar setine sahip olmalı).

- [ ] **Step 4: Commit**

```bash
git add src/lib/i18n.tsx
git commit -m "feat(i18n): add recurring reminder edit strings (TR/EN)"
```

---

### Task 7: CalendarView — modalı genelleştir + recurring satırına kalem

**Files:**
- Modify: `src/components/CalendarView.tsx`

> READ the file first. It currently has `EditInstallmentModal` (installment-only), a pencil button rendered only for `o.kind === "installment"`, and `{editing && <EditInstallmentModal ... />}` at the end of the JSX. The recurring row keeps its inline "Tutar gir" amount input — do NOT remove it.

- [ ] **Step 1: Kalem butonunu her iki türde göster**

Şu bloğu:
```tsx
                    {o.kind === "installment" && (
                      <button
                        disabled={isLoadingItem}
                        onClick={() => setEditing(o)}
                        className="shrink-0 p-1 rounded-lg text-gray-300 hover:text-blue-500 hover:bg-blue-50 transition disabled:opacity-50"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                    )}
```
şununla değiştir (koşul kaldırılır; recurring + installment için görünür):
```tsx
                    <button
                      disabled={isLoadingItem}
                      onClick={() => setEditing(o)}
                      className="shrink-0 p-1 rounded-lg text-gray-300 hover:text-blue-500 hover:bg-blue-50 transition disabled:opacity-50"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
```

- [ ] **Step 2: Render çağrısını yeniden adlandır**

Şunu:
```tsx
      {editing && (
        <EditInstallmentModal
          occurrence={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); onUpdated(); }}
          t={t}
        />
      )}
```
şununla değiştir:
```tsx
      {editing && (
        <EditOccurrenceModal
          occurrence={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); onUpdated(); }}
          t={t}
        />
      )}
```

- [ ] **Step 3: `EditInstallmentModal` fonksiyonunu `EditOccurrenceModal` ile değiştir**

Dosyanın sonundaki `EditInstallmentModal` fonksiyonunun tamamını şununla değiştir:

```tsx
function EditOccurrenceModal({
  occurrence,
  onClose,
  onSaved,
  t,
}: {
  occurrence: Occurrence;
  onClose: () => void;
  onSaved: () => void;
  t: any;
}) {
  const isRecurring = occurrence.kind === "recurring";
  const [date, setDate] = useState(format(occurrence.dueDate, "yyyy-MM-dd"));
  const [amount, setAmount] = useState(
    occurrence.amount != null ? occurrence.amount.toFixed(2) : ""
  );
  const [saving, setSaving] = useState(false);

  async function submit(reset: boolean) {
    setSaving(true);
    if (isRecurring) {
      await fetch(`/api/recurring/${occurrence.sourceId}/entry`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          reset
            ? { period: occurrence.period, due_date: null }
            : {
                period: occurrence.period,
                due_date: date || null,
                amount: amount === "" ? null : Number(amount),
              }
        ),
      });
    } else {
      await fetch(`/api/payments/${occurrence.sourceId}/override`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          reset
            ? { installment_index: occurrence.installmentIndex, due_date: null, amount: null }
            : {
                installment_index: occurrence.installmentIndex,
                due_date: date || null,
                amount: amount === "" ? null : Number(amount),
              }
        ),
      });
    }
    onSaved();
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-900">{isRecurring ? t.editReminder : t.editInstallment}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition text-xl leading-none">×</button>
        </div>
        <form
          onSubmit={(e) => { e.preventDefault(); submit(false); }}
          className="space-y-4"
        >
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">{t.installmentDate}</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">{isRecurring ? t.amount : t.perInstallmentAmount}</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              disabled={saving}
              onClick={() => submit(true)}
              className="px-3 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition disabled:opacity-60"
            >
              {isRecurring ? t.resetDay : t.resetToDefault}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition disabled:opacity-60"
            >
              {saving ? "…" : t.save}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

> NOT: `t.amount`, `t.perInstallmentAmount`, `t.installmentDate`, `t.editInstallment`, `t.resetToDefault`, `t.save` zaten mevcut; `t.editReminder` ve `t.resetDay` Task 6'da eklendi. `format` ve `useState` bu dosyada zaten import. Recurring satırının satır içi "Tutar gir" input'u korunur.

- [ ] **Step 4: Build + manuel doğrulama**

Run: `npx tsc --noEmit` → hata yok. Ayrıca dosyada `EditInstallmentModal` referansı kalmadığını doğrula (grep).
Run: `npm run dev`; takvimde bir recurring hatırlatıcıya tıkla → kalem → tarihi değiştir (başka aya da alabilirsin) → Kaydet. Occurrence yeni tarihe/aya taşınır, "düzenlendi" rozeti görünür. "Günü sıfırla" varsayılana döndürür (tutar/ödendi korunur). Satır içi "Tutar gir" hâlâ çalışır.

- [ ] **Step 5: Commit**

```bash
git add src/components/CalendarView.tsx
git commit -m "feat(calendar): edit recurring per-month date via generalized modal"
```

---

### Task 8: Son doğrulama

**Files:** (yok — doğrulama)

- [ ] **Step 1: Birim testleri** — Run: `npm test` → 16 test PASS.
- [ ] **Step 2: Tip kontrolü** — Run: `npx tsc --noEmit` → hata yok.
- [ ] **Step 3: Build** — Run: `npm run build` → başarılı.
- [ ] **Step 4: Uçtan uca manuel (npm run dev):**
  1. Bir recurring hatırlatıcı oluştur (örn. her ayın 15'i).
  2. Takvimde 15'ine tıkla → kalem → tarihi 20'sine al → kaydet → 20'sinde görünür, 15'inde görünmez; "düzenlendi" rozeti.
  3. Tarihi bir sonraki aya al → o ayda görünür; satır içi tutar/ödendi hâlâ doğru entry'yi günceller.
  4. "Günü sıfırla" → varsayılan güne döner.
- [ ] **Step 5: Branch'i tamamla** — `superpowers:finishing-a-development-branch`.

---

## Self-Review Notları

- **Spec kapsamı:** due_date kolonu (T1), tip + test literali (T2), recurringOccurrenceForMonth override + recurringOccurrencesInRange + toplayıcı yeniden yazımı (T3), entry PUT due_date (T4), cron tek-gün aralık (T5), i18n (T6), genelleştirilmiş modal + recurring kalem (T7), doğrulama (T8) — hepsi karşılandı.
- **Tip tutarlılığı:** `RecurringEntry.due_date`, `recurringOccurrencesInRange(r, start, end)`, occurrence `period` sabit + `overridden` bayrağı, modal `EditOccurrenceModal` her task'ta tutarlı.
- **Bilinen davranış:** recurring "günü sıfırla" yalnızca due_date'i null'lar (tutar/ödendi korunur); installment "sıfırla" tüm override'ı siler — kasıtlı fark, spec ile uyumlu.
- **Entry yokken "günü sıfırla":** boş bir entry satırı (amount null, is_paid false, due_date null) oluşturabilir — zararsız.
