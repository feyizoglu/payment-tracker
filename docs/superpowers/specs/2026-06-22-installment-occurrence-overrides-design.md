# Taksit Bazlı Tarih + Tutar Override'ı — Tasarım

**Tarih:** 2026-06-22
**Durum:** Onay bekliyor

## Amaç

Taksitli bir ödemenin (mevcut `payments` tablosu; tek seferlik = `total_installments` 1
dahil) **belirli bir taksitine özel** tarih ve/veya tutar değişikliği yapabilmek —
diğer taksitleri etkilemeden. Örn. 12 taksitlik bir planın yalnızca 5. taksitini
20'sinden 25'ine almak ve tutarını o ay için farklı girmek.

### Mevcut durumun kısıtı

`getInstallments` her taksiti eşit tutarla (`amount / total_installments`) ve türetilmiş
clamp'li tarihle (`start_date` + ay ofseti, `day_of_month`'a clamp) üretir. Yani tek bir
taksitin tarihi/tutarı ayrı ayarlanamaz. Bu özellik, az önce eklenen `recurring_entries`
desenini taksitlere uyarlar.

## Kararlar (kullanıcı onaylı)

- **Kapsam:** Yalnızca taksitli ödemeler (`payments`). Recurring'e dokunulmaz (orada tutar
  zaten `recurring_entries` ile düzenlenebiliyor).
- **Giriş noktası:** Takvim seçili gün detayı.
- **Tutar davranışı:** Lokal override — yalnızca o taksit değişir, kalanlara dağıtım
  (rebalance) **yok**. Toplamlar efektif tutarlardan hesaplanır; planın orijinal
  `amount`'ı bilgi amaçlı kalır, efektif toplamdan farklı olabilir.
- **Düzenleyici:** Kalem ikonu → küçük modal (tarih + tutar + "varsayılana sıfırla").

## 1. Veri Modeli (1 yeni tablo)

`supabase-schema.sql`'e eklenir:

```sql
create table if not exists payment_overrides (
  id uuid default gen_random_uuid() primary key,
  payment_id uuid references payments(id) on delete cascade not null,
  installment_index integer not null check (installment_index >= 0),
  due_date date,                 -- null = türetilmiş varsayılan tarih
  amount numeric(12,2),          -- null = türetilmiş varsayılan tutar (amount/total)
  created_at timestamptz default now(),
  unique (payment_id, installment_index)
);
```

RLS: `payments` ile aynı desen (service-role bypass; select/insert/update/delete
`using (true)`). Satır yalnızca bir taksit özelleştirilince oluşur.

## 2. Tipler (`src/types/index.ts`)

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

- `Payment`'a `overrides?: PaymentOverride[]` eklenir (GET'te embed edilir).
- `PaymentInstallment`'a `overridden?: boolean` eklenir (UI rozeti için).

## 3. Occurrence Katmanı (`src/lib/payments.ts`)

Tek nokta değişikliği — `getInstallments` override'ları uygular:

- Taksit `i` için `payment.overrides`'ta `installment_index === i` aranır.
- `due_date` doluysa o tarih kullanılır (yerel parse, clamp yok); yoksa mevcut türetilmiş
  clamp'li tarih.
- `amount` doluysa o tutar; yoksa `amount / total_installments`.
- Override (tarih ya da tutar) varsa `overridden: true` işaretlenir.

`getRemainingAmount` ödenmemiş taksitlerin **efektif** tutar toplamına çevrilir
(`getInstallments(...).filter(!isPaid).reduce(+amount)`), böylece override'ları yansıtır.
`installmentOccurrences` / `getOccurrencesForMonth` / `getOccurrencesInRange` zaten
`getInstallments`'tan beslendiği için takvim, PayUntil, aylık/haftalık toplamlar ve e-posta
cron'u override'ları **otomatik** kullanır. `getTotalMonthly` (nominal "aylık" göstergesi)
olduğu gibi bırakılır.

## 4. API

`PUT /api/payments/[id]/override` — body `{ installment_index, due_date, amount }`
(her ikisi de null olabilir).
- `(payment_id, installment_index)` üzerinden upsert.
- Merge sonrası `due_date` ve `amount` **ikisi de** null ise satır **silinir** (varsayılana
  sıfırlama). Aksi halde upsert.
- `due_date` 'yyyy-MM-dd' olarak normalize edilir.
- Yetki: mevcut `payments` route'undaki `canManagePayment` ile aynı (sahip veya takım
  sahibi). Bu helper yeni route'a kopyalanır (küçük, mevcut desenle birebir).

## 5. UI — Takvim Seçili Gün Detayı (`CalendarView`)

Taksit (`kind === "installment"`) occurrence satırına **kalem (Pencil)** ikonu eklenir
(yalnızca taksitlerde; recurring'de yok). Tıklayınca küçük modal `EditInstallmentModal`
açılır:

- **Tarih** alanı (date input), varsayılan = occurrence'ın mevcut efektif `dueDate`'i.
- **Tutar** alanı (number), varsayılan = mevcut efektif `amount`.
- **Varsayılana sıfırla** butonu → `PUT` ile `{ due_date: null, amount: null }` (satırı siler).
- **Kaydet** → `PUT` ile değerler. Boş bırakılan alan null gönderilir (o boyut varsayılana
  döner).
- Kaydet/sıfırla sonrası `onUpdated()` çağrılır (dashboard payments'ı yeniden çeker).

Override'lı taksit satırında küçük bir "düzenlendi" rozeti gösterilir (`o.overridden`'a göre
— occurrence'a `overridden` taşınır). Mevcut paid toggle / sil / recurring tutar girişi
korunur. Modal `EditPaymentModal` (PaymentCard içindeki) stiliyle tutarlı, ayrı küçük bir
bileşen olarak `CalendarView` içinde tanımlanır.

`Occurrence` tipine `overridden?: boolean` eklenir; `installmentOccurrences` bunu
`inst.overridden`'dan taşır. Modal'ın `installment_index`'e ihtiyacı var → bu zaten
`occurrence.installmentIndex` olarak mevcut.

## 6. Entegrasyon Noktaları

- **`/api/payments` GET** (`route.ts`): select'e `overrides:payment_overrides(*)` embed eklenir.
- **E-posta cron** (`send-reminders/route.ts`): payment select'ine `overrides:payment_overrides(*)`
  eklenir ki hatırlatıcılar efektif tarih/tutarı kullansın (`getInstallments` zaten uygular).
- **PaymentCard:** otomatik olarak efektif tutar/tarihi gösterir (getInstallments üzerinden);
  ek değişiklik gerekmez. (Override düzenleme kartta YOK — sadece takvimde.)

## 7. i18n (`src/lib/i18n.tsx`)

Yeni TR/EN anahtarları: `editInstallment` ("Taksiti Düzenle" / "Edit Installment"),
`installmentDate` ("Tarih" / "Date"), `resetToDefault` ("Varsayılana sıfırla" /
"Reset to default"), `editedBadge` ("düzenlendi" / "edited").

## 8. Testler (vitest — `src/lib/payments.test.ts`)

- Tutar override: belirli index'in efektif tutarı değişir, diğerleri `amount/total` kalır.
- Tarih override: index'in `dueDate`'i override değerine eşittir; başka aya taşınınca
  `getOccurrencesForMonth` onu yeni ayda döndürür, eski ayda döndürmez.
- `overridden` bayrağı yalnızca override'lı taksitte true.
- Sıfırlama mantığı API'de (ikisi de null → sil) — birim testi kapsam dışı (DB davranışı);
  occurrence tarafı override yokken varsayılana döner (mevcut testler bunu zaten kapsıyor).
- `getRemainingAmount` override'lı planda efektif kalan tutarı verir.

## 9. Sınır Durumları

- Tarih override başka aya taşırsa occurrence o aya geçer; toplamlar/PayUntil otomatik takip.
- Ödendi takibi `paid_installments` sayacıyla kalır; override etkilemez (paid, "ilk N" mantığı).
- Override tutar plan toplamından bağımsızdır; efektif toplam orijinalden farklı olabilir
  (bilinçli karar).
- Plan düzenlenip `total_installments` azaltılırsa, index'i artık var olmayan override satırları
  occurrence üretiminde sessizce yok sayılır (eşleşen index olmaz). Cascade gerektirmez; zararsız
  ölü satır. (YAGNI: temizleme job'ı eklenmez.)

## Kapsam Dışı (YAGNI)

- Recurring için tarih override'ı (ayrı, sonraki iş).
- Kalan taksitlere yeniden dağıtım (rebalance).
- PaymentCard'dan düzenleme (yalnızca takvim).
- Override geçmişi / audit.
- `total_installments` küçülünce ölü override satırlarını otomatik temizleme.
