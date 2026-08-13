# Plan 3c — Mobil ödeme ekleme/düzenleme + occurrence override'ları

## Context

`mobile/` Expo uygulaması 4-plan dizisinin ortasında: Plan 1 (backend), 2 (iskelet/auth), 3a (`@ptracker/shared`), 3b (Ödemeler tab: liste/takvim + mark-paid) bitti (`fc94932`). Mobil şu an **salt okunur + mark-paid**: ödeme ekleme, seri düzenleme, occurrence override (tarih/tutar) yok. Ayrıca web'e 3b'den sonra yeni bir özellik girdi — efektif-tarihli gün değişikliği ve edit modalındaki "bu ay / bu ve sonrası" scope seçimi (`688ca36..ab3a753`) — mobilde hiç yok.

Plan 3c bu üç yazma akışını mobile taşır ve web ile feature parity sağlar. Aynı zamanda mobilde **ilk** form altyapısını kurar (bugün uygulamada tek bir `TextInput` bile yok), bu altyapıyı 3d/3e/3f kullanacak.

Kararlar (kullanıcı onaylı): tam parity (3 akış) · kök seviye modal route'lar · i18n şimdi bağlanır · paylaşılan UI primitive'leri kurulur · tarih seçici `@react-native-community/datetimepicker`.

## Mevcut yapı — uyulacak kurallar

- **Metro kuralı:** mobil, ortak kodu **`@ptracker/shared/*`** paketinden import eder (`@shared/*` runtime import'u Metro'da patlar). Yeni ortak modül eklerken `shared/` içine koy + web'de 1 satırlık re-export shim bırak (`src/lib/payments.ts` deseni).
- **Test kuralı:** `mobile/vitest.config.ts` yalnız `src/lib/**/*.test.ts` çalıştırır, `environment: "node"`, RN render testi yok. Bu yüzden **tüm mantık `src/lib/`'e saf fonksiyon olarak çıkar**, ekran (`.tsx`) ince kalsın — `markPaidRequest` deseni (`mobile/src/lib/occurrences.ts:12`).
- **Veri deseni:** `useState` + `load()` + mutasyondan sonra tam `load()` refetch (`mobile/src/app/(app)/index.tsx:26-83`). React Query yok, eklenmeyecek.
- **Stil:** NativeWind `className`. Sözlük: kart `rounded-xl border border-gray-100 bg-white p-3`, birincil buton `rounded-lg bg-brand px-6 py-3` + `text-brand-fg`, hata `text-red-600` / `bg-red-50`.
- `mobile/AGENTS.md`: kod yazmadan önce https://docs.expo.dev/versions/v57.0.0/ ilgili sayfaları oku (Stack.Protected, NativeTabs, modal presentation).

## Yaklaşım

7 fazlı, her fazı ayrı commit. Faz 1-3 altyapı; 4-6 ekranlar; 7 bağlama + doğrulama.

### Faz 1 — `shared/edit-occurrence.ts` (yeniden kullanım, yeni kod değil)

`src/lib/edit-occurrence.ts` içindeki `decideEditSubmit({occurrence, reset, scope, date, initialDate, amounts}) → {url, body}` 6 vakayı (reset/forward/normal × installment/recurring) zaten çözüyor ve **mobil aynı API'ye gidiyor** — path'ler birebir aynı. Bu yüzden port etme, taşı:

- `shared/edit-occurrence.ts` ← dosyanın kendisi (`shared/payments.ts`'ten `isPureDayChange` import eder).
- `src/lib/edit-occurrence.ts` → `export * from "../../shared/edit-occurrence"` shim.
- `src/lib/edit-occurrence.test.ts` → `shared/` test konumu ne ise ona uydur; ayrıca `mobile/src/lib/edit-occurrence.wiring.test.ts` ile `@ptracker/shared/edit-occurrence`'ın mobil toolchain'de çözüldüğünü kanıtla (`shared-i18n.wiring.test.ts` deseni).
- Metot `PUT`; mobil `api.put` zaten var (`mobile/src/lib/api.ts`).

### Faz 2 — i18n bağlama + eksik key'ler

- `mobile/src/app/_layout.tsx`'te `AuthProvider` dışına/içine `LanguageProvider` (`@ptracker/shared/i18n`) mount et.
- Yeni ekranlar `useLang().t` kullanır. Mevcut hardcoded Türkçe ekranlar (`app-tabs`, `month-list`, `occurrence-row`…) **bu planda değiştirilmez** — 3f'in işi.
- `shared/i18n.tsx`'te form key'lerinin çoğu var (`addPaymentTitle, paymentName, totalAmount, firstPaymentDate, numberOfInstallments, dayOfMonthLabel, endMonthOptional, editScopeLabel, scopeThisOnly, scopeForwardRecurring, scopeForwardInstallment, resetDay, resetToDefault, cancel, save…`). Eksik kalan mobil-özel key'ler (ör. silme onayı, "Ödeme türü", form hata mesajları) **`en` ve `tr`'ye birlikte** eklenir — `type Translations = typeof translations.en` olduğu için tek tarafa eklemek tsc'yi kırar.

### Faz 3 — UI primitive'leri + date picker

- `npx expo install @react-native-community/datetimepicker` (Expo Go içinde gelir, dev build gerektirmez).
- Yeni `mobile/src/components/ui/`: `text-field.tsx`, `number-field.tsx`, `select-field.tsx` (basit bottom-sheet/Modal seçim listesi — RN'de native `<select>` yok), `date-field.tsx` (datetimepicker sarmalayıcı, `yyyy-MM-dd` string in/out), `month-field.tsx` (yıl + ay iki select'i, `yyyy-MM` string in/out — native month picker yok), `segmented-toggle.tsx`, `primary-button.tsx`, `form-screen.tsx` (KeyboardAvoidingView + ScrollView + başlık + Kaydet/İptal iskeleti + hata banner'ı).
- Hepsi named export, prop tipleri imzada inline, `React.FC` yok.

### Faz 4 — Ödeme ekleme ekranı

- Route: `mobile/src/app/payment-form.tsx`, kök `_layout.tsx`'teki authed `Stack.Protected` içinde `<Stack.Screen name="payment-form" options={{ presentation: "modal", headerShown: true, title: t.addPaymentTitle }} />`.
- Alanlar `src/components/PaymentForm.tsx`'i birebir aynalar: `entryKind` toggle (installment/recurring) · `name` · installment tarafı: `inputMode` (total/per-installment) + amount + currency + `total_installments` (1..120) · recurring tarafı: currency + `endMonth` · ortak: `start_date` (varsayılan: takvimde seçili gün, yoksa bugün) · `team_id` select · `targetUserId` (yalnız seçili takımın sahibiysen ve başka üye varsa).
- Takım/üye verisi: `GET /api/teams` (mevcut route). Yükleme başarısızsa form takımsız (kişisel) çalışmaya devam etmeli.
- Mantık `mobile/src/lib/payment-form.ts`'e: `PaymentFormState` tipi, `validatePaymentForm(state) → string | null`, `paymentFormToRequest(state) → {url, body}` (installment → `POST /api/payments` `amount = total` veya `perInstallment * count`; recurring → `POST /api/recurring`). Para birimi doğrulaması `cleanCurrencyAmounts` / `ALLOWED_CURRENCIES` (`@ptracker/shared/payments`) ile.
- Başarıda `router.back()` + Ödemeler tab'ında refetch (aşağı bak).

### Faz 5 — Seri düzenleme + silme

- Route: `mobile/src/app/payment/[id].tsx` ve `mobile/src/app/recurring/[id].tsx` (ikisi de modal). `useLocalSearchParams()` ile id; seri verisi tab'dan param olarak değil, mevcut listeden id ile bulunur veya modal kendi `GET`'ini yapar — listeden geçirmek daha basit, id + tip yeterli, ekran `api.get` ile taze çeker.
- Installment serisi (`src/components/PaymentCard.tsx:202+` aynası): `name`, `amount` + currency, `total_installments`; istemci doğrulaması `total >= paid_installments` → `PATCH /api/payments/{id}`.
- Recurring serisi (`src/components/RecurringCard.tsx:103-193` aynası): `name`, `day_of_month` (1..31), `currency`, `end_month` (nullable) → `PATCH /api/recurring/{id}`.
- Silme: `Alert.alert` onayı (web'deki `confirm()` karşılığı) → `DELETE /api/payments/{id}` | `/api/recurring/{id}`. **Seriyi tamamen siler** — kullanıcıya metinde bunu açıkça söyle.
- Mantık `mobile/src/lib/series-form.ts`'e (validasyon + body üretimi), testli.

### Faz 6 — Occurrence düzenleme modalı (planın kalbi)

`src/components/CalendarView.tsx:403-593`'ün aynası. Route `mobile/src/app/occurrence-edit.tsx`, occurrence kimliği route param'ı olarak (`sourceType`, `sourceId`, `installmentIndex`/`period`, `dueDate`) — Occurrence nesnesini JSON param'la taşımak yerine tab'daki listeden yeniden türet.

- **Tarih override:** `date-field`, başlangıç değeri occurrence'ın `dueDate`'i.
- **Tutar override:** tekrarlanabilir `AmountLine[] = {currency, amount}` satırları — para birimi select'i + tutar alanı, satır sil `×` (>1 iken), "+ Para birimi ekle". Başlangıç değerleri web'deki `installmentInitialAmounts` / `recurringInitialAmounts` mantığıyla (override.amounts → override.amount → `payment.amount / total_installments`; recurring'de entry.amounts → entry.amount → boş).
- **Scope seçimi:** yalnız `isPureDayChange(date, initialDate)` true iken görünür; radyo grubu `t.scopeThisOnly` / `t.scopeForwardRecurring|scopeForwardInstallment`, varsayılan `"one"`.
- **Reset butonu:** `submit(reset = true)`; etiket recurring'de `t.resetDay`, installment'ta `t.resetToDefault`.
- **Doğrulama:** boş satır atlanır; sonlu olmayan veya `<= 0` tutar → hata.
- **Gönderim:** `decideEditSubmit(...)` (Faz 1'den) → `api.put(url, body)`. Yeni transport kodu **yazılmaz**.

### Faz 7 — Ödemeler tab'ına bağlama + doğrulama

- `mobile/src/app/(app)/index.tsx`: sağ altta "+" FAB → `/payment-form?date=<seçili gün>`; `occurrence-row`'a kalem butonu → occurrence-edit route'u; satırdan seriye gitmek için uzun basma → seri düzenleme route'u.
- **Modal kapandıktan sonra tazeleme:** ekran odağa dönünce `load()` çağır (expo-router `useFocusEffect`). Mevcut mark-paid deseniyle tutarlı (tam refetch).
- Sözleşmeyi doğrulayan `mobile/src/lib/*.test.ts` testleri: `payment-form.test.ts`, `series-form.test.ts`, `edit-occurrence.wiring.test.ts`, occurrence param → request eşlemesi.

## Dokunulacak kritik dosyalar

**Taşınan/paylaşılan:** `shared/edit-occurrence.ts` (yeni, `src/lib/edit-occurrence.ts`'ten) · `src/lib/edit-occurrence.ts` (shim'e iner) · `shared/i18n.tsx` (yeni key'ler, en+tr)

**Mobil yeni:** `src/app/payment-form.tsx` · `src/app/payment/[id].tsx` · `src/app/recurring/[id].tsx` · `src/app/occurrence-edit.tsx` · `src/components/ui/*` (7 primitive) · `src/lib/payment-form.ts` · `src/lib/series-form.ts` + testleri

**Mobil değişen:** `src/app/_layout.tsx` (LanguageProvider + 4 modal `Stack.Screen`) · `src/app/(app)/index.tsx` (FAB, edit girişleri, focus refetch) · `src/components/occurrence-row.tsx` (kalem butonu) · `mobile/package.json` (datetimepicker)

**Yeniden kullanılan (yeni kod yazma):** `@ptracker/shared/payments` → `cleanCurrencyAmounts`, `ALLOWED_CURRENCIES`, `getCurrencySymbol`, `isPureDayChange`, `getOccurrencesForMonth`, `getInstallments` · `@ptracker/shared/edit-occurrence` → `decideEditSubmit` · `mobile/src/lib/api.ts` → `get/post/put/patch/del` + `ApiError` · `mobile/src/lib/occurrences.ts` → `occurrenceKey`, `markPaidRequest`

**Sunucu tarafı: değişiklik yok.** Tüm route'lar (`POST /api/payments`, `POST /api/recurring`, `PATCH /api/{payments,recurring}/[id]`, `PUT /api/payments/[id]/override`, `PUT /api/recurring/[id]/entry`, `PUT .../day-forward`, `DELETE`, `GET /api/teams`) mevcut ve mobil JWT auth'u zaten destekliyor.

## Doğrulama

1. `cd mobile && npx tsc --noEmit` — sıfır hata (yeni i18n key'leri en+tr eşleşmesini burada yakalar).
2. `cd mobile && npm test` — yeni `src/lib/*.test.ts` dosyaları dahil yeşil.
3. Kök: `npx tsc --noEmit && npm test` — `edit-occurrence` taşınması web'i kırmamalı; mevcut `src/lib/edit-occurrence.test.ts` ve day-forward route testleri geçmeli.
4. `cd mobile && npx expo export --platform android` — bundle üretilmeli (RN render testi olmadığı için ekranların gerçek doğrulaması bu).
5. `npx expo start` + Expo Go ile elle uçtan uca:
   - Taksitli ödeme ekle → Ödemeler tab'ında doğru ayda görünüyor mu (adet, tutar, gün).
   - Düzenli ödeme ekle (end_month'lu) → son aydan sonra görünmemeli.
   - Bir occurrence'ta yalnız günü değiştir → scope radyosu çıkmalı; "bu ay" seç → sadece o ay kayıyor; tekrar dene, "bu ve sonrası" seç → sonraki aylar da kayıyor (web'de aynı seriyi açıp doğrula).
   - Tutar override'ı çok para birimli gir → satırda doğru sembollerle görünüyor; Reset → varsayılana dönüyor.
   - Seri düzenle (isim/taksit adedi) ve seri sil (onay diyalogu) → listeden kayboluyor.
   - Aynı verileri web'de aç, mobilde yapılanla birebir aynı mı bak.

## Kapsam dışı (bilinçli)

- Mevcut ekranların hardcoded Türkçe metinlerini i18n'e çevirmek → Plan 3f (dil switcher'la birlikte).
- "Skip occurrence" — web'de de yok.
- Optimistik güncelleme / React Query — mevcut tam-refetch deseni korunur.
- EAS dev build, native Google sign-in, push → Plan 4.
