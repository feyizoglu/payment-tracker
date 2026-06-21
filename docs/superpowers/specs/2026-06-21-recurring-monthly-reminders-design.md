# Aylık Tekrar Eden Ödeme Hatırlatıcıları — Tasarım

**Tarih:** 2026-06-21
**Durum:** Onay bekliyor

## Amaç

Kullanıcı, taksit mantığından bağımsız olarak "her ayın belirli bir gününde
bir ödemem var" diyebilmeli (örn. kredi kartı). Bu kayıt bir **hatırlatıcı**
gibi davranır: oluştururken tutar zorunlu değildir; kullanıcı her ayın tutarını
**sonradan, takvimden tek tek girer ve istediği zaman değiştirebilir**.

### Mevcut durumun kısıtı

`payments` tablosu tamamen taksit odaklı: aylık tutar her zaman
`amount / total_installments` ile türetilir, yani her ayın tutarı farklı olamaz
ve bitişsiz/süresiz bir kayıt kavramı yoktur. İstenen model bu tabloya sığmaz,
bu yüzden ayrı bir veri yapısı kuruyoruz (Yaklaşım A).

## Kararlar (kullanıcı onaylı)

- **Tutar modeli:** Sadece hatırlatıcı; tutar opsiyonel, sonradan aylık girilir.
  Carry-over / varsayılan tutar **yok**.
- **Yaşam döngüsü:** Varsayılan süresiz; **opsiyonel bitiş ayı** desteklenir.
- **Kapsam:** Takvim görünümü, "Şu tarihe kadar öde" (PayUntil), e-posta
  hatırlatıcıları ve aylık/haftalık toplamların hepsine entegre.
- **Mimari:** Yaklaşım A — 2 yeni tablo + birleşik "occurrence" katmanı.
- **Form:** Mevcut `PaymentForm`'a tür anahtarı eklenir (tek giriş noktası).
- **Boş tutar:** Tutar girilene kadar takvimde sadece renkli nokta görünür,
  para toplamlarına **0 katkı** yapar.
- **Test:** Saf `lib/payments.ts` occurrence fonksiyonları için **vitest** birim
  testleri; UI manuel doğrulanır.

## 1. Veri Modeli

`supabase-schema.sql` dosyasına eklenecek iki yeni tablo:

```sql
create table if not exists recurring_payments (
  id uuid default gen_random_uuid() primary key,
  team_id uuid references teams(id) on delete cascade,
  user_id uuid references users(id) on delete cascade not null,
  name text not null,
  currency text not null default 'TRY',
  day_of_month integer not null check (day_of_month between 1 and 31),
  start_month date not null,        -- her zaman ilgili ayın 1'i
  end_month date,                   -- null = süresiz; dahil (inclusive)
  created_at timestamptz default now()
);

create table if not exists recurring_entries (
  id uuid default gen_random_uuid() primary key,
  recurring_id uuid references recurring_payments(id) on delete cascade not null,
  period date not null,             -- ilgili ayın 1'i
  amount numeric(12,2),             -- null = tutar henüz girilmedi
  is_paid boolean not null default false,
  paid_at timestamptz,
  created_at timestamptz default now(),
  unique (recurring_id, period)
);
```

RLS: `payments` tablosundaki politikalarla birebir aynı desen (service-role
API tüm işlemleri bypass eder; select/insert/update/delete `using (true)`).

**Tasarım notları**
- `recurring_entries` satırı yalnızca kullanıcı bir aya tutar girince veya
  ödendi işaretleyince oluşur → süresiz tekrar sonsuz satır gerektirmez.
- `period` ve `start_month`/`end_month` her zaman ayın 1'i olarak normalize
  edilir; gün bilgisi yalnızca `day_of_month`'ta tutulur.
- Tarih alanları yerel saatle parse edilir (mevcut `start_date.split("-")`
  deseni) — timezone off-by-one'ı önlemek için.

## 2. Tipler (`src/types/index.ts`)

```ts
export interface RecurringPayment {
  id: string;
  team_id: string | null;
  user_id: string;
  name: string;
  currency: string;
  day_of_month: number;
  start_month: string;       // 'yyyy-MM-01'
  end_month: string | null;  // 'yyyy-MM-01' | null
  created_at: string;
  entries?: RecurringEntry[];
  user?: User;
}

export interface RecurringEntry {
  id: string;
  recurring_id: string;
  period: string;            // 'yyyy-MM-01'
  amount: number | null;
  is_paid: boolean;
  paid_at: string | null;
  created_at: string;
}

export interface Occurrence {
  kind: "installment" | "recurring";
  sourceId: string;          // payment.id veya recurring.id
  name: string;
  currency: string;
  user_id: string;
  team_id: string | null;
  dueDate: Date;
  amount: number | null;     // recurring + tutar girilmemiş → null
  isPaid: boolean;
  // installment'a özel
  installmentIndex?: number;
  totalInstallments?: number;
  // recurring'e özel
  period?: string;
  entryId?: string | null;
}
```

## 3. Birleşik Occurrence Katmanı (`src/lib/payments.ts`)

Mevcut `getInstallments` / `getPaymentsForMonth` **korunur** (taksit akışına
dokunmuyoruz). Yeni saf fonksiyonlar eklenir:

```ts
// Taksit -> Occurrence (mevcut getInstallments üstüne ince adaptör)
function installmentOccurrences(payment: Payment): Occurrence[];

// Bir şablon verilen ay için aktif mi? Aktifse tek occurrence döner.
// Aktiflik: start_month <= period <= (end_month ?? +∞). Gün ay-sonuna clamp.
// amount/isPaid o aya ait entry'den; entry yoksa amount=null, isPaid=false.
function recurringOccurrenceForMonth(
  r: RecurringPayment, year: number, month: number
): Occurrence | null;

// Taksit + tekrar edenleri birleştirip güne göre sıralı döndürür.
export function getOccurrencesForMonth(
  payments: Payment[],
  recurrings: RecurringPayment[],
  year: number,
  month: number
): Occurrence[];

// PayUntil ve cron için: [start, end] aralığındaki tüm occurrence'lar.
export function getOccurrencesInRange(
  payments: Payment[],
  recurrings: RecurringPayment[],
  start: Date,
  end: Date
): Occurrence[];
```

Gün clamp'ı mevcut mantıkla aynı: `Math.min(day_of_month, ayın son günü)`.

## 4. API (`src/app/api/recurring/...`)

`payments` API'sinin yetki/filtre desenini birebir takip eder
(`canManage` helper, takım üyeliği kontrolü, `target_user_id` ile admin adına
ekleme). Hepsinde `export const dynamic = "force-dynamic"`.

- `GET /api/recurring` → kullanıcının/takımlarının şablonları, her biri
  `entries` dizisiyle. Filtre mantığı `GET /api/payments` ile aynı
  (`all | personal | teamId`).
- `POST /api/recurring` → şablon oluştur. Body: `name, currency, day_of_month,
  start_month, end_month?, team_id?, target_user_id?`. **Tutar yok.**
  `day_of_month` ve `start_month` ilk ödeme tarihinden türetilir (istemci
  gönderir; sunucu normalize eder).
- `PATCH /api/recurring/[id]` → `name, day_of_month, currency, end_month` güncelle.
- `DELETE /api/recurring/[id]` → şablon + entries (cascade) sil.
- `PUT /api/recurring/[id]/entry` → upsert. Body: `{ period, amount?, is_paid? }`.
  `(recurring_id, period)` unique üzerinden upsert. Hem tutar girme hem ödendi
  işaretleme bu uçtan yapılır. `is_paid=true` olunca `paid_at=now()`.

## 5. UI

### 5.1 PaymentForm (tür anahtarı)
En üste segment toggle: **Taksitli | Aylık tekrar eden**.
- *Taksitli:* mevcut alanlar/akış aynen.
- *Aylık tekrar eden:* alanlar → ad, para birimi, **ilk ödeme tarihi** (gün +
  start_month türetilir), **opsiyonel bitiş ayı** (month input), takım,
  (admin ise) "kimin için". Tutar alanı **yok**. İpucu metni:
  "Tutarı her ay takvimden gireceksin." Submit `POST /api/recurring`'e gider.

### 5.2 CalendarView
- `getPaymentsForMonth` yerine `getOccurrencesForMonth` kullanılır; bileşen
  `recurrings` prop'u da alır. Render `Occurrence` tipine göre normalize edilir.
- Gün hücresi: recurring occurrence aktif her ay ilgili günde nokta gösterir
  (tutar null olsa bile). Ödenince yeşil. Gün-toplam rozeti yalnızca
  `amount != null` olanları toplar.
- Seçili gün detayı, recurring occurrence için:
  - ödendi onay kutusu → `PUT entry { period, is_paid }`
  - ad + "Aylık tekrar eden" alt etiketi (taksitte "x / y" etiketi korunur)
  - **satır içi düzenlenebilir tutar:** `amount == null` → "Tutar gir"
    placeholder'lı input; blur/enter'da `PUT entry { period, amount }`.
    Doluysa tutara tıklayınca aynı input'a döner.
  - çöp kutusu → şablonu sil (`DELETE`), güçlü onay: "Bu hatırlatıcı ve tüm
    aylarındaki kayıtlar silinecek."

### 5.3 "Tümü" görünümü
Hafif `RecurringCard`: ad, "Her ayın {gün}'i • Aylık tekrar eden", bu ayki
tutar (varsa), bitiş ayı (varsa); düzenle (ad/gün/bitiş) ve sil. `PaymentCard`
desenini takip eder; sadece yetkili (`canManage`) kullanıcıya düzenle/sil.

## 6. Entegrasyonlar (dashboard)

`dashboard/page.tsx` ek olarak `GET /api/recurring` çeker (`recurrings` state).
- **Aylık/haftalık toplam:** `getOccurrencesForMonth` çıktısından ödenmemiş ve
  `amount != null` occurrence'lar mevcut taksit toplamlarına eklenir (para
  birimi bazında).
- **Aktif ödeme sayısı:** o ay aktif (süresi dolmamış) şablon sayısı eklenir.
- **PayUntil:** `getOccurrencesInRange(today, end)` ödenmemişler; `amount != null`
  olanlar para toplamına girer, `amount == null` olanlar listede "—" rozetiyle
  görünür ama toplama girmez.

## 7. E-posta Cron (`api/cron/send-reminders`)

Mevcut taksit taramasına ek olarak: aktif (süresi dolmamış) recurring şablonlar
arasında, clamp'lenmiş `day_of_month` yarının gününe denk gelen ve o ay entry'si
`is_paid` olmayanlar `dueByUser`'a eklenir. Tablo satırında "Taksit" sütunu
recurring için "—"; tutar varsa tutar, yoksa "—" gösterilir.

## 8. i18n (`src/lib/i18n.tsx`)

Yeni TR/EN anahtarları: tür toggle etiketleri (`installmentMode`/`recurringMode`),
"Aylık tekrar eden", "Tutarı her ay takvimden gireceksin", "Bitiş ayı (ops.)",
"Tutar gir", recurring silme onay metni, RecurringCard etiketleri.

## 9. Testler (vitest)

`package.json`'a `vitest` eklenir; `test` script'i. Kapsam yalnızca saf
fonksiyonlar (`src/lib/payments.test.ts`):
- gün clamp'i (31 → kısa ayların son günü)
- aktif-ay sınırları: `start_month` öncesi yok, içinde var, `end_month` dahil,
  sonrası yok, `end_month=null` süresiz
- entry eşleştirme: doğru period → amount/isPaid; entry yoksa null/false
- `getOccurrencesForMonth` taksit + recurring birleşimi ve gün sıralaması
- `getOccurrencesInRange` aralık sınırları (dahil/hariç)

## 10. Sınır Durumları

- 29–31. günler kısa aylarda ay-sonuna clamp'lenir.
- `start_month` gelecekteyse hatırlatıcı o aydan itibaren görünür.
- `end_month` dahil (o ay hâlâ görünür, sonraki ay görünmez).
- Şablon silinince entries cascade ile silinir.
- Takım görünürlüğü/RLS `payments` ile aynı.
- Aynı `(recurring_id, period)` için tekrar `PUT entry` upsert davranır
  (çift satır oluşmaz).

## Kapsam Dışı (YAGNI)

- Tutar için carry-over / varsayılan değer.
- Aylık/yıllık dışında özel tekrar aralıkları (haftalık, 2 ayda bir vb.).
- Geçmiş aylar için toplu tutar düzenleme arayüzü (her ay tek tek girilir).
- Recurring için para birimi dönüşümü / ekonomi entegrasyonu.
