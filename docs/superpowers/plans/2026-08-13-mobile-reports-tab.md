# Plan 3e — Mobil Raporlar sekmesi

## Context

3c ödemeleri, 3d ekonomiyi eşitledi. Kalan parite alanı **raporlar**: web'de iki görünüm var — `DateRangeReport` (iki tarih arası, para birimi bazında toplam/ödenen/kalan + taksit listesi) ve `PayUntil` (bugünden seçilen tarihe kadar ödenmemişler).

Bu port sırasında düzeltilecek gerçek bir tutarsızlık var: **`DateRangeReport` düzenli ödemeleri hiç saymıyor** (bileşene `recurrings` prop'u geçilmiyor) ve ham taksitler üzerinden grupladığı için **çok para birimli bir taksiti yalnız ilk para biriminde** topluyor. `PayUntil` ise occurrence'lar üzerinden çalıştığı için ikisini de doğru yapıyor. Aynı verinin iki raporda farklı çıkması hata; kullanıcı kararıyla **her iki platformda da düzeltilecek** — yani web'in tarih aralığı raporunun rakamları değişecek (artık düzenli ödemeler dahil).

Ayrıca aynı "para birimine göre topla" mantığının repoda **üç ayrı kopyası** var (`DateRangeReport.fmtCurrencyGroup`, `PayUntil.byCurrency`, `dashboard/page.tsx:toCurrencyLines`) ve hiçbirinin testi yok.

Kararlar (kullanıcı onaylı): iki rapor da gelir · web ile birlikte düzeltilir · mobilde 3. sekme olarak durur.

## Mevcut yapı — uyulacak kurallar

- `shared/` içinde JSX YASAK (Metro/NativeWind). Doğrulaması yalnız `npx expo export --platform android`.
- Mobil ortak kodu `@ptracker/shared/*`'dan alır.
- Mantık `src/lib/`'e saf çıkar; mobil vitest yalnız `src/lib/**/*.test.ts` (node env).
- Form/liste primitive'leri 3c'de kuruldu (`mobile/src/components/ui/*`), 3d'de kullanıldı — yeniden kullan.
- Yeni i18n key'leri `en` + `tr` birlikte.

## Yaklaşım

### Faz 1 — `shared/reports.ts` (+ ilk testler)

- `sumByCurrency(occurrences)` → `Record<string, number>`; `amount == null` olanları atlar (düzenli ödemelerin tutarsız ayları).
- `formatCurrencyTotals(byCurrency)` → `"₺1.000,00 + $50,00"`; `getCurrencySymbol` yeniden kullanılır.
- `rangeReport(payments, recurrings, start, end)` → `{ occurrences, due, paid, remaining }` — üçü de para birimi bazında. `getOccurrencesInRange` üstünde çalışır: düzenli ödemeler dahil, çok para birimli satırlar ayrı. `start > end` ise boş sonuç.
- `payUntilReport(payments, recurrings, today, end)` → `{ occurrences, byCurrency }`; yalnız `!isPaid`.

Testler: aralık sınırları (dahil/hariç), ödenmiş/ödenmemiş ayrımı, çok para birimli taksitin iki satıra ayrılması, düzenli ödemenin rapora girmesi, `amount: null` atlanması, ters aralık.

### Faz 2 — Web'i `shared/reports.ts`'e bağla (davranış düzeltmesi)

- `DateRangeReport`'a `recurrings` prop'u eklenir (`dashboard/page.tsx` zaten elinde tutuyor), inline aralık döngüsü ve `fmtCurrencyGroup` silinir, `rangeReport` çağrılır.
- `PayUntil` inline `byCurrency` reduce'u yerine `payUntilReport` kullanır.
- `dashboard/page.tsx:toCurrencyLines` de `sumByCurrency`/`formatCurrencyTotals`'a bağlanır (üçüncü kopya ölür).
- Liste satırlarının görünümü değişmez; değişen tek şey rapora düzenli ödemelerin girmesi ve çok para birimli satırların doğru ayrışması.

### Faz 3 — Mobil Raporlar sekmesi

- `mobile/src/app/(app)/reports.tsx` + `app-tabs.tsx`'e üçüncü trigger (`Raporlar`, ikon şimdilik `home.png` yeniden kullanılır).
- Ekran iki bölüm, üstte `SegmentedToggle` ile geçiş: **Tarih Aralığı** ve **Şu Tarihe Kadar**.
- Tarih Aralığı: iki `DateField` (varsayılan bugün → +1 ay), 3 özet kart (toplam/ödenen/kalan, para birimi bazında), altında tarih sıralı occurrence listesi.
- Şu Tarihe Kadar: tek `DateField` (varsayılan ayın son günü), para birimi başına toplam kutusu, ödenmemiş occurrence listesi.
- Veri: `GET /api/payments?filter=all` + `GET /api/recurring?filter=all`, `useFocusEffect` ile tazeleme (3c/3d deseni).
- Satır bileşeni: mevcut `OccurrenceRow` yeniden kullanılamaz (o mark-paid/edit aksiyonlu) — salt okunur `report-row.tsx` yazılır.

### Faz 4 — Doğrulama

## Dokunulacak kritik dosyalar

**Paylaşılan (yeni):** `shared/reports.ts` · `src/lib/reports.ts` (shim) · `src/lib/reports.test.ts`

**Web (davranış düzeltmesi):** `src/components/DateRangeReport.tsx` · `src/components/PayUntil.tsx` · `src/app/dashboard/page.tsx`

**Mobil yeni:** `src/app/(app)/reports.tsx` · `src/components/report-row.tsx` · `src/lib/report-view.ts` (+ testi — varsayılan tarihler, sekme durumu)

**Mobil değişen:** `src/components/app-tabs.tsx` (+ `.web.tsx`)

**Yeniden kullanılan:** `@ptracker/shared/payments` → `getOccurrencesInRange`, `getCurrencySymbol` · `mobile/src/lib/dates.ts` → `toIsoDate`/`fromIsoDate` · `mobile/src/components/ui/date-field.tsx`, `segmented-toggle.tsx`

**Sunucu tarafı: değişiklik yok.**

## Doğrulama

1. Kök `npx tsc --noEmit` + `npm test` — yeni rapor testleri dahil
2. `cd mobile && npx tsc --noEmit` + `npm test`
3. `cd mobile && npx expo export --platform android`
4. Elle: aynı tarih aralığını web ve mobilde aç, rakamlar birebir aynı mı · çok para birimli override'lı bir taksit iki satır olarak mı görünüyor · düzenli ödeme rapora giriyor mu · ters aralık boş sonuç mu · "şu tarihe kadar" ödenmişleri gizliyor mu

## Kapsam dışı (bilinçli)

- `MonthlyView.tsx` — hiçbir yerden mount edilmiyor, ölü kod; portlanmaz
- Sayı/tarih biçimlerindeki hardcoded `tr-TR` locale'i seçili dile bağlamak → Plan 3f (dil switcher'la birlikte)
- Raporda para birimi dönüşümü (FX) — web'de de yok, para birimi bazında ayrı gösterilir
