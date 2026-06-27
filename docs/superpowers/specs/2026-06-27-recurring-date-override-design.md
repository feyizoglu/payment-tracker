# Recurring Hatırlatıcılara Aya Özel Tarih (Gün) Değiştirme — Tasarım

**Tarih:** 2026-06-27
**Durum:** Onay bekliyor

## Amaç

Takvimde "Tutar gir" ile yönetilen **recurring (aylık tekrar eden) hatırlatıcıların**
belirli bir ayının **gününü/tarihini** değiştirebilmek. Şu an recurring occurrence'ların
tarihi sabit `day_of_month`'tan türetiliyor ve aya özel değiştirilemiyor. Taksitlerde bu
zaten `payment_overrides` ile mümkün; bu iş aynı yeteneği recurring tarafına getirir.

**Karar (kullanıcı onaylı):** Tarih **başka aya da taşınabilir** (tam esneklik). Bu yüzden
recurring occurrence toplama mantığı "aya göre"den "efektif tarihe göre"ye çevrilir.

## 1. Veri Modeli

`recurring_entries` tablosuna nullable `due_date` kolonu eklenir:

```sql
alter table recurring_entries add column if not exists due_date date;
```

- `due_date = null` → varsayılan tarih (`day_of_month`, ay-sonuna clamp'li).
- `due_date` dolu → o aya (period'a) özel tarih; başka aya da işaret edebilir.
- `amount`, `is_paid`, `paid_at` aynen kalır; `due_date` bunlardan bağımsız bir kolondur.

`(recurring_id, period)` unique kısıtı korunur — tarih override'ı entry satırının bir alanıdır,
yeni satır oluşturmaz.

## 2. Tipler (`src/types/index.ts`)

`RecurringEntry`'ye `due_date` eklenir:

```ts
export interface RecurringEntry {
  id: string;
  recurring_id: string;
  period: string;            // 'yyyy-MM-01' — occurrence'ın bağlı olduğu ay (sabit)
  amount: number | null;
  is_paid: boolean;
  paid_at: string | null;
  due_date: string | null;   // 'yyyy-MM-dd' | null (aya özel tarih)
  created_at: string;
}
```

`Occurrence.overridden?: boolean` zaten mevcut (taksit override'ı için eklenmişti); recurring
için de kullanılır.

## 3. Lib (`src/lib/payments.ts`)

### 3.1 `recurringOccurrenceForMonth` — override uygula
Bir period için occurrence üretirken entry'nin `due_date`'i varsa onu kullanır ve
`overridden` işaretler:

```
const day = clampDay(year, month, r.day_of_month);
let dueDate = new Date(year, month, day);
let overridden = false;
const entry = r.entries?.find((e) => e.period === period);
if (entry?.due_date) {
  const [oy, om, od] = entry.due_date.split("-").map(Number);
  dueDate = new Date(oy, om - 1, od);  // başka ayda olabilir
  overridden = true;
}
return { ...occurrence..., dueDate, overridden, period, ... };
```

`period` alanı **her zaman fonksiyona verilen (year, month)** — yani occurrence'ın bağlı
olduğu ay sabit kalır; `dueDate` başka aya taşınsa bile entry güncellemeleri doğru period'a
gider.

### 3.2 Yeni yardımcı: `recurringOccurrencesInRange(r, start, end)`
Bir hatırlatıcının **efektif tarihi** `[start, end]` (Date, dahil) aralığına düşen tüm
occurrence'larını döndürür:

```
const seenPeriods = new Set<string>();
// 1. due_date override'lı entry'ler — tarihi nereye düşerse
for (const e of r.entries ?? []) {
  if (!e.due_date) continue;
  const [ey, em] = e.period.split("-").map(Number);
  const occ = recurringOccurrenceForMonth(r, ey, em - 1);
  if (occ && occ.dueDate >= start && occ.dueDate <= end) out.push(occ);
  seenPeriods.add(e.period);            // bu period override branch'inde ele alındı
}
// 2. override'sız aylar — varsayılan gün
iterate month MM from start..end:
  period = 'yyyy-MM-01' for MM
  if (seenPeriods.has(period)) continue;
  const occ = recurringOccurrenceForMonth(r, MM.year, MM.month);
  if (occ && occ.dueDate >= start && occ.dueDate <= end) out.push(occ);
```

Doğruluk: override'lı occurrence'lar (period'larından bağımsız) entry verisinden enumerate
edilir; override'sızlar her ay için varsayılan günle. Period'u override edilip aralık dışına
taşınanlar branch 1'de eklenmez ve branch 2'de `seenPeriods` ile atlanır — yani çift sayım
veya kayıp olmaz.

### 3.3 `getOccurrencesForMonth` / `getOccurrencesInRange`
Recurring kısmı bu yardımcıyı kullanacak şekilde sadeleşir:

```
// getOccurrencesForMonth(payments, recurrings, year, month):
const start = new Date(year, month, 1);
const end = new Date(year, month + 1, 0); end.setHours(23,59,59,999);
for (const r of recurrings) result.push(...recurringOccurrencesInRange(r, start, end));
// (installment kısmı aynen: dueDate'i o ayda olanları filtreler)
// sort: getOccurrencesForMonth -> dueDate.getDate(); getOccurrencesInRange -> getTime()
```

```
// getOccurrencesInRange(payments, recurrings, start, end):
for (const r of recurrings) result.push(...recurringOccurrencesInRange(r, start, end));
```

`recurringOccurrencesInRange` export edilir (cron kullanacak).

## 4. API (`PUT /api/recurring/[id]/entry`)

Mevcut upsert'e `due_date` desteği eklenir:

```ts
if (body.due_date !== undefined) {
  payload.due_date = body.due_date ? String(body.due_date) : null;
}
```

- `{ period, due_date }` → o ayın tarihini ayarlar (upsert; amount/is_paid korunur).
- `{ period, due_date: null }` → günü varsayılana döndürür (amount/is_paid korunur).
- Mevcut `amount` / `is_paid` davranışı değişmez.

## 5. E-posta Cron (`send-reminders/route.ts`)

Recurring taraması, tek-günlük aralıkla `recurringOccurrencesInRange` kullanır ki başka aydan
yarına taşınan hatırlatıcı da yakalansın:

```
const dayStart = new Date(tYear, tMonth, tDay, 0, 0, 0, 0);
const dayEnd = new Date(tYear, tMonth, tDay, 23, 59, 59, 999);
for (const r of recurrings) {
  for (const occ of recurringOccurrencesInRange(r, dayStart, dayEnd)) {
    if (occ.isPaid) continue;
    // dueByUser'a ekle (mevcut DueItem mantığı: isRecurring, amount occ.amount)
  }
}
```

(Eski `recurringOccurrenceForMonth(r, tYear, tMonth)` + gün eşitliği kontrolü kaldırılır.)

## 6. UI (`CalendarView` — seçili gün detayı)

- Recurring occurrence satırına da **kalem (Pencil)** ikonu eklenir (şu an yalnızca
  installment'ta var → koşul her iki türü kapsayacak şekilde genişler).
- Mevcut `EditInstallmentModal` → **`EditOccurrenceModal`** olarak genelleştirilir; tarih +
  tutar alanları korunur, kaydetme `occurrence.kind`'a göre yönlendirilir:
  - **installment:** `PUT /api/payments/{sourceId}/override` `{ installment_index, due_date, amount }`;
    "varsayılana sıfırla" → ikisi de null (satırı siler — mevcut davranış).
  - **recurring:** `PUT /api/recurring/{sourceId}/entry` `{ period, due_date, amount }`;
    "günü sıfırla" → `{ period, due_date: null }` (tutar/ödendi korunur).
- Tarih input'unda min/max **yok** (başka aya taşınabilir).
- Satır içi "Tutar gir" kutusu **korunur** (hızlı giriş).
- `o.overridden` true olunca mevcut "düzenlendi" rozeti otomatik görünür (recurring'de
  `due_date` override'ı bunu tetikler).
- Modal başlığı ve "sıfırla" etiketi türe göre: yeni i18n anahtarları `editReminder`,
  `resetDay`. (Mevcut `editInstallment`, `resetToDefault`, `installmentDate`,
  `perInstallmentAmount`, `save`, `cancel` yeniden kullanılır.)

## 7. i18n (`src/lib/i18n.tsx`)

Yeni TR/EN anahtarları:
- `editReminder`: "Hatırlatıcıyı Düzenle" / "Edit Reminder"
- `resetDay`: "Günü sıfırla" / "Reset day"

## 8. Testler (`src/lib/payments.test.ts`)

- recurring entry `due_date` → occurrence.dueDate o tarihe eşit, `overridden` true.
- override'sız → varsayılan clamp'li gün, `overridden` falsy.
- **cross-month:** period Temmuz olan bir entry'nin `due_date`'i Ağustos'a taşınınca,
  `getOccurrencesForMonth(..., Temmuz)` onu döndürmez; `getOccurrencesForMonth(..., Ağustos)`
  döndürür ve occurrence'ın `period`'u hâlâ Temmuz'dur.
- `recurringOccurrencesInRange` aralık sınırları (dahil/hariç) ve override'lı/override'sız
  karışımı.

## 9. Sınır Durumları

- Aynı entry hem `amount` hem `due_date` tutar; biri değişince diğeri korunur (upsert yalnız
  gönderilen kolonu günceller).
- `due_date` null'a çekilince occurrence varsayılan güne döner, `overridden` false olur, rozet
  kalkar.
- Taşınan occurrence'ın `period`'u sabit → satır içi tutar/ödendi/silme doğru entry'ye yazar.
- Ödendi takibi recurring'de zaten entry-bazlı (`is_paid`), tarih taşımasından etkilenmez.
- Period override edilip aralık dışına taşınırsa o ayda görünmez (doğru); yeni ayında görünür.

## Kapsam Dışı (YAGNI)

- Taksitlerde zaten mevcut; orada değişiklik yok (modal genelleştirme hariç).
- Recurring için tarih başına birden çok occurrence (tek period = tek occurrence kalır).
- Geçmiş override'ların audit/geçmişi.
