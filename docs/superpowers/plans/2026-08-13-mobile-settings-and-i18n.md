# Plan 3f — Mobil Ayarlar sekmesi, dil switcher ve locale borcu

## Context

3c/3d/3e mobili web ile eşitledi ama üç borç bıraktı:

1. **Ayarlar yok.** Mobilde takım yönetimi (oluştur/davet/üye listesi), kullanıcı rengi ve dil seçimi hiç yok; çıkış yapma tek başına Ödemeler sekmesinin dibinde asılı duruyor.
2. **Dil switcher yok.** `LanguageProvider` mobilde `initialLang="tr"` ile sabit; seçim yok, kalıcılık yok. Beş dosyada hâlâ hardcoded Türkçe metin var (sekme etiketleri, boş durumlar, hafta günleri, hata mesajları).
3. **Locale sabit.** Sayı ve tarih biçimleri her yerde `tr-TR` / date-fns `tr` — web'de dil switcher olmasına rağmen. EN seçili kullanıcı hâlâ Türkçe tarih görüyor. Mobilde 6, `shared/` içinde 3, web'de 13 nokta.

Ayrıca yol üstünde bulunan **gerçek bir yetkilendirme açığı** var ve kullanıcı kararıyla bu planda kapatılıyor: `POST /api/teams/{id}/invite` çağıranın o takımla ilişkisini hiç kontrol etmiyor — kimliği doğrulanmış herhangi biri, takım id'sini bilirse kendini (veya bir başkasını) o takıma ekleyip tüm ödemeleri ve varlıkları görebiliyor.

Kararlar (kullanıcı onaylı): davet açığı şimdi düzeltilir · locale her yerde (mobil + shared + web) · Ayarlar 4. sekme.

## Mevcut yapı — uyulacak kurallar

- `shared/` içinde JSX YASAK; doğrulaması yalnız `npx expo export --platform android`.
- Mobil ortak kodu `@ptracker/shared/*`'dan alır.
- Mantık `src/lib/`'e saf çıkar (mobil vitest yalnız `src/lib/**/*.test.ts`, node env).
- Sunum bileşenleri metni **prop olarak** alır (`report-row.tsx` `paidLabel`, `bank-group.tsx` `accountsLabel` deseni) — `useLang()`'i bileşenin içine gömme.
- Yeni i18n key'leri `en` + `tr` birlikte.

## Yaklaşım

### Faz 1 — Davet yetkilendirmesi (güvenlik)

- `src/app/api/teams/[id]/invite/route.ts`: çağıranın o takımda **owner** olduğunu doğrula, değilse 403. (Bugün hiç kontrol yok.)
- `src/app/api/teams/route.ts` POST: boş/boşluk isim reddi (400) — bugün sunucu kabul ediyor.
- İkisi için de route testi (`src/app/api/.../route.test.ts` deseni mevcut: day-forward testleri).

### Faz 2 — `shared/i18n.ts`: locale yardımcıları + kontrol edilebilir dil

- `localeFor(lang)` → `"tr-TR" | "en-US"`; `dateFnsLocaleFor(lang)` → date-fns `tr`/`enUS`.
- `LanguageProvider`'a `onLangChange?: (lang) => void` — mobil seçimi kalıcılaştırabilsin, web'i etkilemez.

### Faz 3 — Mobil dil kalıcılığı

- `mobile/src/lib/language-storage.ts` (AsyncStorage, `app_language`, fail-soft — `economy-storage.ts` deseni) + testi.
- `_layout.tsx`: dil geri yüklenene kadar `LanguageProvider` render'ını beklet (auth-context'teki `ready` deseni), sonra `initialLang={restored ?? "tr"}` + `onLangChange` ile yaz.

### Faz 4 — Mobil hardcoded metinler

Beş dosya i18n'e geçer: `app-tabs.tsx` (+ `.web.tsx`), `month-header.tsx`, `month-list.tsx`, `payments-calendar.tsx`, `(app)/index.tsx`, `sign-in.tsx`. Yeni key'ler: `tabPayments`, `tabReports`, `tabSettings`, `viewList`, `viewCalendar`, `noPaymentsMonth`, `updateFailed`, `signInFailed`, `signInNoIdToken`.

`occurrences.ts:occurrenceTypeBadge` içindeki `"Aylık"` — fonksiyon saf, React değil; etiketi **parametre** olarak alacak (mevcut `paidLabel` deseni).

Scaffold artıkları silinir: `hint-row.tsx`, `app-tabs.web.tsx`'teki "Expo Starter"/"Docs" bölümü.

### Faz 5-7 — Locale borcu

- `mobile/src/lib/calendar.ts`: dört formatlayıcı `lang` parametresi alır; çağıranlar `useLang()`'ten geçirir.
- `shared/economy.ts` (`formatAmount`, `formatPreferred`) ve `shared/reports.ts` (`formatCurrencyTotals`) locale parametresi alır; varsayılan kalkar, çağıranlar açıkça geçirir.
- Web'deki 13 nokta `localeFor(lang)` kullanır (`economy/page.tsx:163` zaten bu deseni uyguluyor, örnek o).
- Cron e-postası (`send-reminders`) kapsam dışı: alıcının dili DB'de tutulmuyor, ayrı iş.

### Faz 8 — Ayarlar sekmesi

`mobile/src/app/(app)/settings.tsx` + 4. tab trigger:
- **Dil**: `SegmentedToggle` TR/EN → `setLang` + kalıcılaştır.
- **Rengim**: 12 renk swatch (web `COLOR_OPTIONS` `shared/`'a taşınır) → `PATCH /api/users/me`.
- **Takımlar**: liste (üyeler + owner rozeti), takım oluştur, üye davet (e-posta). Route'lar: `POST /api/teams`, `POST /api/teams/{id}/invite`, `GET /api/teams`.
- **Çıkış**: `signOut` buraya taşınır, Ödemeler sekmesinin dibinden kalkar.
- Form mantığı `mobile/src/lib/settings-form.ts`'e (isim/e-posta doğrulama, istek gövdeleri) + testleri.

### Faz 9 — Doğrulama

## Dokunulacak kritik dosyalar

**Sunucu (güvenlik):** `src/app/api/teams/[id]/invite/route.ts` · `src/app/api/teams/route.ts` + testleri

**Paylaşılan:** `shared/i18n.ts` (locale yardımcıları, `onLangChange`, yeni key'ler) · `shared/economy.ts` · `shared/reports.ts` · `shared/teams.ts` (yeni — `COLOR_OPTIONS`)

**Mobil yeni:** `src/app/(app)/settings.tsx` · `src/lib/language-storage.ts` · `src/lib/settings-form.ts` + testleri

**Mobil değişen:** `_layout.tsx` · `app-tabs.tsx` (+`.web.tsx`) · `month-header.tsx` · `month-list.tsx` · `payments-calendar.tsx` · `(app)/index.tsx` · `sign-in.tsx` · `lib/calendar.ts` · `lib/occurrences.ts` · silinen: `hint-row.tsx`

**Web değişen (locale):** `CalendarView.tsx` · `PaymentCard.tsx` · `PaymentForm.tsx` · `DateRangeReport.tsx` · `PayUntil.tsx` · `dashboard/page.tsx` · `economy/page.tsx`

## Doğrulama

1. Kök `npx tsc --noEmit` + `npm test` (yeni route testleri dahil)
2. `cd mobile && npx tsc --noEmit` + `npm test`
3. `cd mobile && npx expo export --platform android`
4. Elle: dili EN yap → tüm sekmeler, boş durumlar, hafta günleri, tarih ve sayı biçimleri İngilizce mi · uygulamayı kapat aç → dil seçimi korunuyor mu · takım oluştur, üye davet et, rengi değiştir · başkasının takımına davet göndermeyi dene → 403 · çıkış Ayarlar'dan çalışıyor mu

## Kapsam dışı (bilinçli)

- Cron hatırlatma e-postalarının dili (alıcı dili DB'de yok)
- Takımdan ayrılma / takım silme / üye çıkarma / rol değiştirme — web'de de yok
- Kullanıcı renginin takımsız kullanıcıda okunamaması (web'de de var; `/api/users/me` GET'i yok)
