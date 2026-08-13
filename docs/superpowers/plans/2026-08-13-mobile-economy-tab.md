# Plan 3d — Mobil Ekonomi sekmesi

## Context

Plan 3c ile mobil, ödemeler tarafında web ile eşitlendi. Sıradaki paritesiz alan **Ekonomi**: banka bazlı varlık listesi, çoklu para birimi + 5 altın türü, canlı kur/altın fiyatlarıyla tek para biriminde toplam.

Web'de bu özelliğin tamamı **tek bir 1159 satırlık dosyada** (`src/app/economy/page.tsx`) — sayfa, 5 alt bileşen ve tüm dönüşüm matematiği orada, ve **hiç testi yok**. `shared/` içinde ekonomiye ait yalnızca tipler (`Asset`, `Currency`, `GoldType`, `ExchangeRates`) ve i18n metinleri var.

Bu plan mobil Ekonomi sekmesini kurar ve bunu yaparken dönüşüm matematiğini `shared/economy.ts`'e çıkarıp test altına alır — yani mobil parite kazanırken web de test kazanır.

Kararlar (kullanıcı onaylı): tam parity · `explore` sekmesinin yerine geçer · kur önbelleği için AsyncStorage.

## Mevcut yapı — uyulacak kurallar

- **`shared/` içinde JSX YASAK.** Mobil babel `shared/` dosyalarını da NativeWind runtime'ına çevirir, Metro proje kökü dışından `react-native-css-interop`'u çözemez. `shared/economy.ts` saf mantık olacak (zaten öyle).
- **`tsc` bunu yakalamaz, sadece `npx expo export --platform android` yakalar.** Her fazda çalıştır.
- Mobil ortak kodu **`@ptracker/shared/*`** paketinden alır, `@shared/*` değil.
- Test: `mobile/vitest.config.ts` yalnız `src/lib/**/*.test.ts`, node env, RN render testi yok. Mantık `src/lib/`'e saf çıkar, ekran ince kalsın.
- Veri deseni: `useState` + `load()` + mutasyondan sonra tam refetch; `useFocusEffect` ile modal dönüşünde tazeleme (3c deseni).
- Form altyapısı 3c'de kuruldu: `mobile/src/components/ui/` (`FormScreen`, `TextField`, `SelectField`, `SegmentedToggle`, `PrimaryButton`, `DangerLink`, `Field`). Yeniden kullan, yenisini yazma.
- Yeni i18n key'leri **`en` ve `tr`'ye birlikte** eklenir.

## Yaklaşım

### Faz 1 — `shared/economy.ts` (çıkarma + ilk testler)

`src/app/economy/page.tsx` içindeki saf fonksiyonları taşı; web dosyası bunları import etsin (davranış değişmeden):

- `isGoldType(c)`, `goldUnit(c)`, `FIAT_SYMBOLS`, `GOLD_TYPES`, `FIAT_CURRENCIES`
- `formatAmount(amount, currency)`, `formatPreferred(amount, fiat)`
- `toUSD(amount, currency, rates)`, `fromUSD(usd, target, rates)`
- `groupByBank(assets)`, `hashColor(id)`
- **Yeni (bugün sayfa içinde inline `reduce`)**: `assetTotalIn(assets, preferred, rates)` — `rates.goldError` varken altın varlıklarını toplamdan düşen kural burada tek yerde tanımlansın; hem genel toplam hem banka alt toplamı bunu çağırsın.
- **Yeni**: `filterAssets(assets, filter)` — `all` / `personal` / `<teamId>`.

`shared/economy.test.ts` (veya repo'nun shared test konumu neyse): altın/fiat ayrımı, goldError'da altının düşmesi, USD ara birimiyle gidiş-dönüş, boş liste, bilinmeyen para birimi.

Web `page.tsx` sadece import'a döner — UI değişmez.

### Faz 2 — Mobil kur/tercih önbelleği

- `npx expo install @react-native-async-storage/async-storage`
- `mobile/src/lib/economy-storage.ts`: `getCachedRates()/setCachedRates()`, `getPreferredCurrency()/setPreferredCurrency()`. `storage.ts` deseni gibi native modülü sarmalar; JSON parse hatası → `null` (bozuk önbellek ekranı kilitlemesin).
- `mobile/src/lib/economy-rates.ts`: `ratesStatusFrom(...)` gibi saf durum mantığı + `EXCHANGE_RATES_PATH`. Testli.
- Web'le aynı davranış: açılışta önbellekten oku, otomatik fetch yok, yenileme elle.

### Faz 3 — Ekonomi sekmesi (liste + toplam + filtre + para birimi + kur)

- `mobile/src/app/(app)/explore.tsx` **silinir**; yerine `economy.tsx`. `app-tabs.tsx`'te trigger `explore` → `economy`, etiket `Ekonomi`. İkon: şimdilik mevcut `explore.png` yeniden kullanılır (yeni ikon eklemek ayrı iş).
- Ekran: yeşil toplam kartı (tercih edilen para biriminde) · kur durumu satırı (son güncelleme / hata / altın uyarısı) · Yenile butonu · görüntüleme para birimi seçici (USD/EUR/GBP/TRY) · filtre çipleri (Tümü/Kişisel/takımlar) · banka bazlı gruplu liste (açılır/kapanır kart, alt toplam) · satırda sahip adı + tutar + çevrilmiş değer.
- Veri: `GET /api/assets`, `GET /api/teams`, `GET /api/exchange-rates`.
- Yetki: satırda düzenle/sil yalnız `asset.user_id === me || takımın owner'ı` (web `canManage` kuralı) — bu kural da `shared/economy.ts`'e `canManageAsset(asset, userId, teams)` olarak çıkar ve test edilir.

### Faz 4 — Varlık ekle / düzenle / sil

- Kök modal route'lar (3c deseni): `mobile/src/app/asset-form.tsx` (ekle), `mobile/src/app/asset/[id].tsx` (düzenle + sil).
- Ekle alanları: `bank_name` · para birimi (4 fiat + 5 altın, `SegmentedToggle` + `SelectField`) · `amount` (altında birim `gr`/`adet` ipucu) · takım · owner'san "kimin için".
- Düzenle: yalnız `bank_name` ve `amount` (web'de para birimi düzenlenemiyor) → `PATCH /api/assets/{id}`. Sil: `Alert.alert` onayı → `DELETE`.
- Mantık `mobile/src/lib/asset-form.ts`: `validateAssetForm`, `assetFormToRequest`, `assetEditToBody` — testli. `assignableMembers` (`payment-form.ts`) yeniden kullanılır.

### Faz 5 — Manuel altın girişi

- `mobile/src/app/manual-gold.tsx` modal: 5 altın türü için ₺ cinsinden fiyat alanı, başlangıç değerleri mevcut kurlardan geri hesaplanır (`Math.round(rates[key] / rates.TRY)`).
- `rates.TRY` yoksa form yerine `t.manualGoldNoTRY`.
- Dönüşüm `shared/economy.ts`'e: `manualGoldToRates(existing, tryPrices)` — girilen ₺ fiyatlarını USD-birim kurlarına çevirir, `goldError`'ı temizler, `fetchedAt`'i günceller. Testli (web bugün bu matematiği inline yapıyor).

### Faz 6 — i18n boşlukları

Web'de hardcoded kalmış iki yer key'e döner (ikisi de `en` + `tr`): banka kartındaki `"{n} hesap"` sayacı ve `getCurrencyLabel`'daki fiat isimleri.

### Faz 7 — Doğrulama

## Dokunulacak kritik dosyalar

**Paylaşılan (yeni):** `shared/economy.ts` + testi

**Web (davranış değişmeden import'a döner):** `src/app/economy/page.tsx` · `shared/i18n.ts` (yeni key'ler)

**Mobil yeni:** `src/app/(app)/economy.tsx` · `src/app/asset-form.tsx` · `src/app/asset/[id].tsx` · `src/app/manual-gold.tsx` · `src/components/asset-row.tsx` · `src/components/bank-group.tsx` · `src/lib/economy-storage.ts` · `src/lib/economy-rates.ts` · `src/lib/asset-form.ts` + testleri

**Mobil değişen:** `src/app/(app)/explore.tsx` (**silinir**) · `src/components/app-tabs.tsx` · `src/app/_layout.tsx` (3 yeni modal route) · `mobile/package.json`

**Yeniden kullanılan (yeni kod yazma):** `mobile/src/components/ui/*` (3c) · `mobile/src/lib/payment-form.ts` → `assignableMembers` · `mobile/src/lib/api.ts` · `@ptracker/shared/types` → `Asset`, `Currency`, `GoldType`, `ExchangeRates`

**Sunucu tarafı: değişiklik yok.** `GET/POST /api/assets`, `PATCH/DELETE /api/assets/[id]`, `GET /api/exchange-rates`, `GET /api/teams` mevcut ve mobil JWT'yi zaten destekliyor (`getSessionUser` Bearer'ı okuyor).

## Doğrulama

1. `cd mobile && npx tsc --noEmit` + `npm test`
2. Kök: `npx tsc --noEmit` + `npm test` — `shared/economy.ts` çıkarması web'i kırmamalı
3. `cd mobile && npx expo export --platform android` — **shared/ import'larının Metro'da çözüldüğünün tek gerçek kanıtı**
4. Expo Go ile elle: varlık ekle (fiat + altın) → listede doğru grupta ve birimde görünüyor mu · para birimini değiştir → toplam ve satır çevirileri güncelleniyor mu · kur yenile → son güncelleme saati değişiyor mu · altın fiyatı gelmezse toplamdan düşülüyor ve uyarı çıkıyor mu · manuel altın gir → toplam değişiyor mu · düzenle/sil çalışıyor mu · aynı veriyi web'de aç, rakamlar birebir aynı mı

## Kapsam dışı (bilinçli)

- Yeni sekme ikonu tasarlamak — `explore.png` yeniden kullanılır
- Mevcut ekranların hardcoded Türkçe metinlerini i18n'e çevirmek → Plan 3f
- Kur önbelleğine son kullanma süresi / otomatik yenileme eklemek — web'de de yok, parite korunur
- Takım yönetimi (üye davet vb.) → Plan 3f
