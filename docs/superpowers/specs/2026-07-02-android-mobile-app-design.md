# Android Mobil Uygulama (Expo) — Tasarım

**Tarih:** 2026-07-02
**Durum:** Onaylandı (sözlü onay; yazılı spec incelemesi bekleniyor)

## Amaç

Payment Tracker web sitesinin Android öncelikli mobil uygulamasını yapmak.

**Kullanıcı kararları:**
- **Dağıtım:** Önce kişisel kullanım (APK elden kurulum), ileride Play Store ihtimali açık tutulur.
- **Motivasyon:** Push bildirimleri, ana ekrandan hızlı erişim, widget gibi native yetenekler. Offline çalışma hedef değil.
- **Kapsam:** İlk sürümde web ile **tam özellik eşitliği** (ödemeler, taksitler, tekrarlayanlar, takvim, takımlar, davetler, raporlar, ekonomi/varlıklar, çoklu para birimi, TR/EN).
- **Teknoloji:** React/TypeScript'te kalınır → **Expo (React Native)**.
- **Yaklaşım:** Mobil uygulama **mevcut Next.js API'sini kullanır** (Yaklaşım 1). Supabase'e doğrudan bağlanmaz; iş mantığı tek yerde kalır.

## 1. Genel Mimari ve Repo Yapısı

Aynı repo içinde `mobile/` klasöründe Expo uygulaması:

```
payment-tracker/
├── src/              # mevcut Next.js (değişiklik minimal)
├── mobile/           # yeni Expo uygulaması
│   ├── app/          # Expo Router ekranları
│   ├── components/   # RN bileşenleri
│   ├── lib/          # API client, auth, push kayıt
│   └── app.json      # Expo config (widget plugin dahil)
└── shared/           # paylaşılan tipler + saf yardımcılar
    └── types.ts      # src/types/index.ts buraya taşınır
```

- **Paylaşım:** Sadece tipler ve saf (DOM/React'e bağımlı olmayan) yardımcılar `shared/`'da.
  `src/lib/i18n.tsx` içindeki çeviri sözlükleri de `shared/`'a taşınır; iki taraf aynı
  çeviri verisini kullanır. UI bileşenleri paylaşılmaz.
- **Workspace yok:** Expo kendi `package.json`'ıyla bağımsız; `shared/`'a tsconfig path +
  Metro config ile erişir. Mevcut Next.js kurulumuna dokunulmaz.
- **Veri akışı:** Mobil → `https://<vercel-domain>/api/*` → Supabase. Supabase anon/service
  key uygulamaya gömülmez.
- **Stil:** NativeWind (RN için Tailwind); mevcut renk paleti tek config'de taşınır.

## 2. Kimlik Doğrulama

NextAuth'un cookie oturumu mobilde kullanılamaz; Bearer token akışı eklenir.

**Giriş:**
1. `expo-auth-session` ile native Google girişi (mevcut Google Cloud projesine Android
   OAuth client eklenir).
2. Google **ID token** → `POST /api/auth/mobile`.
3. Sunucu ID token'ı Google public key'leriyle doğrular (`aud` = bizim client ID'ler),
   web'deki `signIn` callback'iyle aynı `users` upsert'ünü yapar.
4. Sunucu `AUTH_SECRET` ile imzalı **uygulama JWT'si** döner (payload: `userId`, `email`;
   süre: 30 gün).
5. Uygulama JWT'yi `expo-secure-store`'da saklar.

**Sonraki istekler:**
- Her istekte `Authorization: Bearer <jwt>`.
- Web tarafında ortak yardımcı: `getSessionUser(request)` — önce Bearer'a bakar, yoksa
  NextAuth `auth()`'a düşer. Tüm API route'lardaki oturum kontrolü buna geçirilir.
  Aynı endpoint'ler hem web hem mobil için çalışır.

**Süre dolumu:** 401 → sessiz yeniden Google girişi. İlk sürümde refresh token yok
(Store sürümünde gerekirse eklenir).

**Çıkış:** Token secure store'dan silinir. Sunucu tarafı iptal listesi yok (YAGNI;
Store sürümünde revocation değerlendirilir).

## 3. Push Bildirimleri

**Kayıt:**
- İlk girişte bildirim izni + Expo Push Token (FCM, Expo servisi üzerinden).
- `POST /api/devices` → yeni Supabase tablosu `devices`
  (`user_id`, `expo_push_token`, `platform`, `updated_at`). Aynı token upsert edilir.

**Gönderim:**
- Mevcut `/api/cron/send-reminders` genişletilir: her e-posta hatırlatması için
  kullanıcının cihazlarına Expo Push API'ye (`https://exp.host/--/api/v2/push/send`)
  bildirim de gönderilir.
- İçerik e-postayla aynı: ödeme adı, tutar, vade. Kullanıcının dil tercihine göre TR/EN.
- `DeviceNotRegistered` yanıtında ilgili cihaz kaydı silinir.

**Dokunma:** Deep link ile ilgili ay görünümü açılır (`paymenttracker://month/2026-07`).

**İlk sürümde yok:** Bildirim kanalı tercihi (e-posta/push seçimi — ikisi de gider),
sessiz saatler, cihaz başına ayar.

## 4. Ekranlar (Tam Özellik Eşitliği)

Expo Router, alt-sekme (bottom tab) yapısı:

- **Ödemeler (ana sekme):** Ay gezinme; aylık liste (`MonthlyView` karşılığı) ↔ takvim
  görünümü geçişi. Ödeme kartları (tek seferlik, taksitli, tekrarlayan), ödendi işaretleme,
  aya özel tutar/tarih override'ları — web modal akışlarının bottom-sheet karşılıkları.
- **Ekle/Düzenle:** `PaymentForm` karşılığı; çoklu para birimi girişi dahil.
- **Ekonomi:** Varlıklar listesi, ekleme/silme, kur bilgisi (`/economy` karşılığı).
- **Raporlar:** Tarih aralığı raporu (`DateRangeReport`) + "şu tarihe kadar ödenecekler"
  (`PayUntil`) tek sekmede.
- **Ayarlar/Profil:** Takım paneli (üyeler, davet), dil seçimi (TR/EN, `shared/` sözlükleri),
  çıkış.

Auth ve devices dışında yeni API endpoint'i gerekmez.

## 5. Android Widget

- İlk sürümde tek widget: **"Bu ay kalan ödemeler"** — toplam tutar + en yakın 2-3 ödeme.
- Teknik: `react-native-android-widget` (Expo config plugin; widget UI JS'ten tanımlanır,
  elle native kod yazılmaz). Dev client gerekir (Expo Go yetmez).
- Veri: Uygulamanın en son çektiği veri paylaşılan yerel depodan okunur; WorkManager ile
  ~6 saatte bir arka plan tazeleme. Dokununca uygulama açılır.

## 6. Hata Yönetimi, Test, Dağıtım

- **Hata yönetimi:** Tüm istekler `mobile/lib/api.ts`'ten geçer. 401 → yeniden giriş akışı;
  ağ hatası → "tekrar dene" bandı; bağlantı yokken net "çevrimdışısın" durumu (offline
  destek yok).
- **Test:** `shared/`'a taşınan saf mantık mevcut Vitest ile test edilir
  (`payments.test.ts` korunur). Mobilde ilk sürümde UI testi yok; API client ve token
  mantığına birim test. Web'e eklenen `getSessionUser` ve `/api/auth/mobile` test edilir.
- **Build/dağıtım:** EAS Build ile dev client + APK (ücretsiz kota). Kişisel kullanımda APK
  elden kurulur. Play Store çıkışı ayrı bir proje (imzalama, privacy policy, listing).

## Kapsam Dışı (bilinçli)

- iOS (mimari engellemiyor; Expo sayesinde yol açık).
- Offline çalışma / yerel senkron.
- Bildirim tercihleri, sessiz saatler.
- Refresh token / token revocation.
- Play Store yayını.
