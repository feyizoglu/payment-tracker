# Taksit Bazlı Tarih + Tutar Override'ı — Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Taksitli bir ödemenin belirli bir taksitine özel tarih ve/veya tutar değişikliği yapabilmek (diğer taksitleri etkilemeden), takvimden bir modal ile.

**Architecture:** Yeni `payment_overrides` tablosu (payment_id, installment_index, due_date?, amount?). Tek nokta entegrasyon: `getInstallments` override'ları uygular, böylece occurrence katmanına bağlı tüm tüketiciler (takvim, PayUntil, toplamlar, e-posta cron'u, PaymentCard) efektif tarih/tutarı otomatik kullanır. Düzenleme takvim seçili-gün detayındaki bir modaldan yapılır.

**Tech Stack:** Next.js 16 (App Router, `force-dynamic`), React 19, TypeScript, Supabase (service-role admin client), date-fns, Tailwind, vitest.

**Spec:** `docs/superpowers/specs/2026-06-22-installment-occurrence-overrides-design.md`

> ⚠️ **Next.js notu (AGENTS.md):** Route handler / dinamik segment konvansiyonu için mevcut `src/app/api/payments/[id]/route.ts`'i referans al — `{ params }: { params: Promise<{ id: string }> }` + `const { id } = await params;`.

---

### Task 1: Veritabanı şeması

**Files:**
- Modify: `supabase-schema.sql`

- [ ] **Step 1: Tabloyu ekle**

`supabase-schema.sql` içinde `-- Enable Row Level Security` satırından **hemen önce** ekle:

```sql
-- Per-installment overrides for installment payments (specific date/amount)
create table if not exists payment_overrides (
  id uuid default gen_random_uuid() primary key,
  payment_id uuid references payments(id) on delete cascade not null,
  installment_index integer not null check (installment_index >= 0),
  due_date date,
  amount numeric(12,2),
  created_at timestamptz default now(),
  unique (payment_id, installment_index)
);
```

- [ ] **Step 2: RLS + politikalar**

`alter table assets enable row level security;` satırından sonra ekle:

```sql
alter table payment_overrides enable row level security;
```

Dosyanın sonuna ekle:

```sql
-- Payment overrides policies (service role bypasses; mirror payments)
drop policy if exists "Members can view payment overrides" on payment_overrides;
drop policy if exists "Users can insert payment overrides" on payment_overrides;
drop policy if exists "Users can update payment overrides" on payment_overrides;
drop policy if exists "Users can delete payment overrides" on payment_overrides;
create policy "Members can view payment overrides" on payment_overrides for select using (true);
create policy "Users can insert payment overrides" on payment_overrides for insert with check (true);
create policy "Users can update payment overrides" on payment_overrides for update using (true);
create policy "Users can delete payment overrides" on payment_overrides for delete using (true);
```

- [ ] **Step 3: Migration manuel — SKIP (insan Supabase'de çalıştıracak). Sadece dosyayı düzenle.**

- [ ] **Step 4: Commit**

```bash
git add supabase-schema.sql
git commit -m "feat(db): add payment_overrides table"
```

---

### Task 2: Tipler

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: PaymentOverride ekle + Payment/PaymentInstallment/Occurrence genişlet**

`src/types/index.ts` içinde `Payment` interface'inde `created_at: string;` satırından sonra (ve `user?: User;`'dan önce) `overrides?: PaymentOverride[];` ekle. Yani:

```ts
export interface Payment {
  id: string;
  team_id: string | null;
  user_id: string;
  name: string;
  amount: number;
  currency: string;
  start_date: string;
  day_of_month: number;
  total_installments: number;
  paid_installments: number;
  created_at: string;
  overrides?: PaymentOverride[];
  user?: User;
}
```

`PaymentInstallment`'a `overridden?: boolean` ekle:

```ts
export interface PaymentInstallment {
  index: number;
  dueDate: Date;
  amount: number;
  isPaid: boolean;
  overridden?: boolean;
}
```

`Occurrence`'a `overridden?: boolean` ekle (mevcut alanların yanına):

```ts
  // ... mevcut Occurrence alanları ...
  overridden?: boolean;
```

Ve yeni tipi ekle (dosyada uygun bir yere, örn. Payment'tan sonra):

```ts
export interface PaymentOverride {
  id: string;
  payment_id: string;
  installment_index: number;
  due_date: string | null;   // 'yyyy-MM-dd'
  amount: number | null;
  created_at: string;
}
```

- [ ] **Step 2: Tip kontrolü**

Run: `npx tsc --noEmit`
Expected: Hata yok.

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat(types): add PaymentOverride and overridden flags"
```

---

### Task 3: `getInstallments` override uygulaması (TDD)

**Files:**
- Modify: `src/lib/payments.ts`
- Test: `src/lib/payments.test.ts`

- [ ] **Step 1: Başarısız testleri ekle**

`src/lib/payments.test.ts` dosyasının sonuna ekle (mevcut import'lara `getInstallments, getRemainingAmount` ekle — dosyanın başındaki import satırını şu hale getir: `import { recurringOccurrenceForMonth, getOccurrencesForMonth, getOccurrencesInRange, getInstallments, getRemainingAmount } from "@/lib/payments";`. `makePayment` helper'ı dosyada zaten var.):

```ts
describe("getInstallments with overrides", () => {
  it("overrides only the targeted installment's amount", () => {
    const p = makePayment({ amount: 1200, total_installments: 12, start_date: "2026-06-10", day_of_month: 10,
      overrides: [{ id: "o1", payment_id: "p1", installment_index: 2, due_date: null, amount: 250, created_at: "" }] });
    const inst = getInstallments(p);
    expect(inst[2].amount).toBe(250);
    expect(inst[2].overridden).toBe(true);
    expect(inst[0].amount).toBe(100);
    expect(inst[0].overridden).toBe(false);
  });

  it("overrides an installment's due date (used as-is, no clamp)", () => {
    const p = makePayment({ amount: 300, total_installments: 3, start_date: "2026-06-10", day_of_month: 10,
      overrides: [{ id: "o1", payment_id: "p1", installment_index: 1, due_date: "2026-09-05", amount: null, created_at: "" }] });
    const inst = getInstallments(p);
    expect(inst[1].dueDate.getFullYear()).toBe(2026);
    expect(inst[1].dueDate.getMonth()).toBe(8); // September
    expect(inst[1].dueDate.getDate()).toBe(5);
    expect(inst[1].overridden).toBe(true);
  });

  it("a date-overridden installment moves to the new month in getOccurrencesForMonth", () => {
    const p = makePayment({ amount: 300, total_installments: 3, start_date: "2026-06-10", day_of_month: 10,
      overrides: [{ id: "o1", payment_id: "p1", installment_index: 1, due_date: "2026-09-05", amount: null, created_at: "" }] });
    // Originally index 1 was July (month 6); now moved to September (month 8)
    expect(getOccurrencesForMonth([p], [], 2026, 6).some((o) => o.installmentIndex === 1)).toBe(false);
    const sep = getOccurrencesForMonth([p], [], 2026, 8);
    expect(sep.some((o) => o.installmentIndex === 1 && o.overridden)).toBe(true);
  });

  it("getRemainingAmount sums effective amounts of unpaid installments", () => {
    const p = makePayment({ amount: 1200, total_installments: 12, paid_installments: 0,
      overrides: [{ id: "o1", payment_id: "p1", installment_index: 0, due_date: null, amount: 300, created_at: "" }] });
    expect(getRemainingAmount(p)).toBe(300 + 100 * 11); // 1400
  });
});
```

- [ ] **Step 2: Testleri çalıştır, FAIL doğrula**

Run: `npm test`
Expected: FAIL — override alanları henüz uygulanmadığı için amount/overridden beklentileri patlar.

- [ ] **Step 3: `getInstallments` ve `getRemainingAmount`'ı güncelle**

`src/lib/payments.ts` içindeki `getInstallments` fonksiyonunu şununla değiştir:

```ts
export function getInstallments(payment: Payment): PaymentInstallment[] {
  const installments: PaymentInstallment[] = [];
  const installmentAmount = payment.amount / payment.total_installments;

  // Parse date as local time (not UTC) to avoid timezone off-by-one
  const [sy, sm, sd] = payment.start_date.split("-").map(Number);

  for (let i = 0; i < payment.total_installments; i++) {
    const base = addMonths(new Date(sy, sm - 1, sd), i);
    // Clamp day to end of month if needed
    const maxDay = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
    const day = Math.min(payment.day_of_month, maxDay);
    let dueDate = setDate(base, day);
    let amount = installmentAmount;
    let overridden = false;

    const override = payment.overrides?.find((o) => o.installment_index === i);
    if (override) {
      if (override.due_date) {
        const [oy, om, od] = override.due_date.split("-").map(Number);
        dueDate = new Date(oy, om - 1, od);
        overridden = true;
      }
      if (override.amount != null) {
        amount = override.amount;
        overridden = true;
      }
    }

    installments.push({
      index: i,
      dueDate,
      amount,
      isPaid: i < payment.paid_installments,
      overridden,
    });
  }

  return installments;
}
```

`getRemainingAmount`'ı şununla değiştir:

```ts
export function getRemainingAmount(payment: Payment): number {
  return getInstallments(payment)
    .filter((inst) => !inst.isPaid)
    .reduce((sum, inst) => sum + inst.amount, 0);
}
```

`installmentOccurrences`'ta `overridden`'ı taşı — map nesnesine ekle (mevcut `totalInstallments: payment.total_installments,` satırından sonra):

```ts
    overridden: inst.overridden ?? false,
```

- [ ] **Step 4: Testleri çalıştır, PASS doğrula**

Run: `npm test`
Expected: PASS (eski 8 + yeni 4 = 12 test).
Run: `npx tsc --noEmit` → hata yok.

- [ ] **Step 5: Commit**

```bash
git add src/lib/payments.ts src/lib/payments.test.ts
git commit -m "feat(lib): apply per-installment date/amount overrides"
```

---

### Task 4: API — `PUT /api/payments/[id]/override`

**Files:**
- Create: `src/app/api/payments/[id]/override/route.ts`

- [ ] **Step 1: Route handler'ı oluştur**

`src/app/api/payments/[id]/override/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

async function canManagePayment(db: ReturnType<typeof supabaseAdmin>, paymentId: string, userId: string) {
  const { data: payment } = await db
    .from("payments")
    .select("user_id, team_id")
    .eq("id", paymentId)
    .single();
  if (!payment) return false;
  if (payment.user_id === userId) return true;
  if (payment.team_id) {
    const { data: membership } = await db
      .from("team_members")
      .select("role")
      .eq("team_id", payment.team_id)
      .eq("user_id", userId)
      .single();
    return membership?.role === "owner";
  }
  return false;
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params; // payment_id
  const db = supabaseAdmin();
  const userId = (session.user as any).id;

  if (!(await canManagePayment(db, id, userId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json(); // { installment_index, due_date, amount }
  if (body.installment_index == null) {
    return NextResponse.json({ error: "installment_index is required" }, { status: 400 });
  }

  const due_date = body.due_date ? String(body.due_date) : null;
  const amount =
    body.amount === null || body.amount === "" || body.amount === undefined
      ? null
      : Number(body.amount);

  // Both null => reset to default (delete the override row)
  if (due_date == null && amount == null) {
    const { error } = await db
      .from("payment_overrides")
      .delete()
      .eq("payment_id", id)
      .eq("installment_index", body.installment_index);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ reset: true });
  }

  const { data, error } = await db
    .from("payment_overrides")
    .upsert(
      { payment_id: id, installment_index: body.installment_index, due_date, amount },
      { onConflict: "payment_id,installment_index" }
    )
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
```

- [ ] **Step 2: Build kontrolü**

Run: `npx tsc --noEmit`
Expected: Hata yok.

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/payments/[id]/override/route.ts"
git commit -m "feat(api): add PUT /api/payments/[id]/override"
```

---

### Task 5: GET'lerde override embed (payments list + cron)

**Files:**
- Modify: `src/app/api/payments/route.ts`
- Modify: `src/app/api/cron/send-reminders/route.ts`

- [ ] **Step 1: payments GET select'ine overrides ekle**

`src/app/api/payments/route.ts` içindeki GET sorgusunda şu satırı:

```ts
    .select("*, added_by_user:users!payments_user_id_fkey(name, email, avatar_url)")
```

şununla değiştir:

```ts
    .select("*, overrides:payment_overrides(*), added_by_user:users!payments_user_id_fkey(name, email, avatar_url)")
```

- [ ] **Step 2: cron select'ine overrides ekle**

`src/app/api/cron/send-reminders/route.ts` içindeki payments sorgusunda şu satırı:

```ts
    .select("*, user:users!payments_user_id_fkey(id, name, email)");
```

şununla değiştir:

```ts
    .select("*, overrides:payment_overrides(*), user:users!payments_user_id_fkey(id, name, email)");
```

- [ ] **Step 3: Build kontrolü**

Run: `npx tsc --noEmit`
Expected: Hata yok.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/payments/route.ts src/app/api/cron/send-reminders/route.ts
git commit -m "feat(api): embed payment overrides in list and cron queries"
```

---

### Task 6: i18n metinleri

**Files:**
- Modify: `src/lib/i18n.tsx`

- [ ] **Step 1: EN bloğuna ekle**

EN bloğundaki `untilMonth: "Until",` satırından sonra ekle:

```ts
    // Installment overrides
    editInstallment: "Edit Installment",
    installmentDate: "Date",
    resetToDefault: "Reset to default",
    editedBadge: "edited",
```

- [ ] **Step 2: TR bloğuna ekle**

TR bloğundaki `untilMonth: "Bitiş",` satırından sonra ekle:

```ts
    // Installment overrides
    editInstallment: "Taksiti Düzenle",
    installmentDate: "Tarih",
    resetToDefault: "Varsayılana sıfırla",
    editedBadge: "düzenlendi",
```

- [ ] **Step 3: Tip kontrolü**

Run: `npx tsc --noEmit`
Expected: Hata yok (iki blok aynı anahtar setine sahip olmalı).

- [ ] **Step 4: Commit**

```bash
git add src/lib/i18n.tsx
git commit -m "feat(i18n): add installment override strings (TR/EN)"
```

---

### Task 7: CalendarView — kalem + EditInstallmentModal + rozet

**Files:**
- Modify: `src/components/CalendarView.tsx`

> READ the file first. The selected-day detail renders `selectedOccurrences.map((o) => ...)`. Recurring occurrences have an inline amount input; installment occurrences show a read-only amount span. We add a pencil button (installments only) that opens a modal, and an "edited" badge.

- [ ] **Step 1: Import'a Pencil ekle + state**

`lucide-react` import satırına `Pencil` ekle. Mevcut import:

```tsx
import { ChevronLeft, ChevronRight, CheckCircle2, Circle, Trash2 } from "lucide-react";
```
şu hale gelir:
```tsx
import { ChevronLeft, ChevronRight, CheckCircle2, Circle, Trash2, Pencil } from "lucide-react";
```

`Occurrence` ve `format`/date-fns zaten import. `useLang` zaten var. Bileşenin en üstündeki state'lerin (örn. `const [loading, setLoading] = useState<string | null>(null);`) yanına ekle:

```tsx
  const [editing, setEditing] = useState<Occurrence | null>(null);
```

- [ ] **Step 2: Taksit satırına kalem butonu + rozet ekle**

Seçili gün detayındaki `selectedOccurrences.map((o) => { ... })` içinde, "x of y / recurringBadge" etiketini gösteren `<p className="text-xs text-gray-400">...</p>` öğesinin hemen ardına, `o.overridden` için bir rozet ekle:

```tsx
                        {o.overridden && (
                          <span className="text-[10px] font-medium text-amber-600 bg-amber-50 rounded px-1.5 py-0.5">
                            {t.editedBadge}
                          </span>
                        )}
```

(Bu `<p>` ile `{addedBy && (...)}` bloğunun arasına, aynı `flex items-center gap-2` kapsayıcısı içinde girer.)

Ardından, satırın sağ tarafındaki sil butonundan (`<button ... onClick={() => deleteOccurrence(o)} ...>`) **önce**, yalnızca taksitlerde görünen bir kalem butonu ekle:

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

- [ ] **Step 3: Modal'ı render et**

Bileşenin en dıştaki return'ünün kapanış `</div>`'inden hemen önce (CalendarView JSX'inin sonunda) ekle:

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

- [ ] **Step 4: EditInstallmentModal bileşenini dosyaya ekle**

`CalendarView.tsx` dosyasının **sonuna** (default export fonksiyonunun dışına) ekle:

```tsx
function EditInstallmentModal({
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
  const [date, setDate] = useState(format(occurrence.dueDate, "yyyy-MM-dd"));
  const [amount, setAmount] = useState(
    occurrence.amount != null ? occurrence.amount.toFixed(2) : ""
  );
  const [saving, setSaving] = useState(false);

  async function submit(reset: boolean) {
    setSaving(true);
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
    onSaved();
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-900">{t.editInstallment}</h2>
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
            <label className="block text-sm font-medium text-gray-700 mb-1.5">{t.perInstallmentAmount}</label>
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
              {t.resetToDefault}
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

- [ ] **Step 5: Build + manuel doğrulama**

Run: `npx tsc --noEmit` → hata yok.
Run: `npm run dev`; takvimde bir taksite tıkla → kalem → tarih ve/veya tutar değiştir → Kaydet. Taksit yeni tarihe/aya taşınır, "düzenlendi" rozeti görünür, toplamlar güncellenir. "Varsayılana sıfırla" override'ı kaldırır.

- [ ] **Step 6: Commit**

```bash
git add src/components/CalendarView.tsx
git commit -m "feat(calendar): edit per-installment date/amount via modal"
```

---

### Task 8: Son doğrulama

**Files:** (yok — doğrulama)

- [ ] **Step 1: Birim testleri** — Run: `npm test` → 12 test PASS.
- [ ] **Step 2: Tip kontrolü** — Run: `npx tsc --noEmit` → hata yok.
- [ ] **Step 3: Build** — Run: `npm run build` → başarılı; `/api/payments/[id]/override` route'u listelenir.
- [ ] **Step 4: Uçtan uca manuel (npm run dev):**
  1. Bir taksitli ödeme (örn. 12 taksit) ekle.
  2. Takvimde 5. taksite tıkla → kalem → tarihi başka bir aya al → kaydet → o ayda görünür, eski ayda görünmez.
  3. Aynı/başka taksitte tutarı değiştir → kart "kalan" ve aylık/haftalık toplam efektif tutarı yansıtır.
  4. "Varsayılana sıfırla" ile geri al.
- [ ] **Step 5: Branch'i tamamla** — `superpowers:finishing-a-development-branch`.

---

## Self-Review Notları

- **Spec kapsamı:** tablo (T1), tipler (T2), getInstallments override + getRemainingAmount efektif + occurrence.overridden (T3), API upsert/reset (T4), payments+cron embed (T5), i18n (T6), takvim modal + rozet (T7), doğrulama (T8) — hepsi karşılandı.
- **Tip tutarlılığı:** `PaymentOverride` alanları (`installment_index`, `due_date`, `amount`), `PaymentInstallment.overridden`, `Occurrence.overridden`, API body `{ installment_index, due_date, amount }` tüm task'larda tutarlı.
- **Davranış:** ikisi de null → satır silinir (sıfırla). Modal alanları efektif değerlerle dolu; kaydedince o taksit pinlenir — spec'teki "o ödemeye özel" kararıyla uyumlu.
- **Bilinen sınır:** `total_installments` küçülünce eşleşmeyen index'li ölü override satırları sessizce yok sayılır (YAGNI; temizleme yok).
