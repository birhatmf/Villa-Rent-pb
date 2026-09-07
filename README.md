# My Villa

My Villa; villa listeleme, tarih bazlı müsaitlik, güvenli rezervasyon, admin/ev sahibi takvimi ve dış kanal iCal senkronizasyonu içeren bir kiralama uygulamasıdır.

## Kaldığımız durum

Son güncelleme: **7 Eylül 2026**

| Aşama | Durum | Teslim |
| --- | --- | --- |
| 1 — Müsaitlik temeli | Tamamlandı | Ortak tarih kuralları, güvenli public yanıtlar, villa listeleme ve detay müsaitliği |
| 2 — Rezervasyon çekirdeği | Tamamlandı | `HOLD`/`CONFIRMED`, idempotency, villa satır kilidi ve PostgreSQL çakışma kısıtı |
| 3 — Takvim yönetimi | Tamamlandı | Admin/ev sahibi takvimi, blok nedenleri, sürüm kontrolü ve işlem geçmişi |
| 4 — iCal | Teknik teslim tamamlandı | Güvenli import/export, senkronizasyon işçisi, kaynak sağlığı ve çakışma görünürlüğü |
| 5 — Kapora ve ödeme | Havale akışı tamamlandı | Uçtan uca rezervasyon adımları, admin tanımlı IBAN'a kapora havalesi, filtrelenebilir rezervasyon listesi ve ayrı detay/onay ekranı. POS/webhook ihtiyaç kesinleştiğinde eklenecek |

Ana dalın Aşama 4 referansı: `df16d6d`.

Aşama 4 için kalan kabul adımı, gerçek bir Airbnb veya Booking hesabına ait **özel iCal URL'siyle canlı pilot** yapmaktır. URL yalnızca villa düzenleme ekranındaki **Takvim ve Dış Kanallar** bölümüne girilmeli; kaynak koda, issue'ya veya loglara yazılmamalıdır.

Ayrıntılı ürün ve teknik kararlar için [uygulama planına](docs/plans/villa-musaitlik-rezervasyon-ical.md) bakın.

## Teknoloji

- Frontend: Next.js 15, React 19, TypeScript ve Tailwind CSS
- Backend: NestJS 11, Prisma 6 ve PostgreSQL
- Takvim: `ical.js`; `RRULE`, `RDATE`, `EXDATE`, `RECURRENCE-ID`, iptal ve şeffaf olay desteği
- Kimlik doğrulama: HTTP-only çerezde JWT, backend rol kontrolleri

Uygulama ilk kapsamda bir villayı tek stok birimi olarak kabul eder. Tarihler `[giriş, çıkış)` biçimindedir; çıkış günü başka bir rezervasyonun giriş günü olabilir.

## Yerel kurulum

Gereksinimler: güncel Node.js/npm ve PostgreSQL.

### Backend

```sh
cd backend
npm install
```

`backend/.env` dosyasını oluşturun:

```dotenv
DATABASE_URL=postgresql://kullanici:parola@localhost:5432/my_villa
JWT_SECRET=yerel-gelistirme-icin-uzun-bir-deger
ICAL_ENCRYPTION_KEY=ical-adresleri-icin-ayri-uzun-bir-deger
FRONTEND_ORIGIN=http://localhost:3000
PUBLIC_URL=http://localhost:4000
PORT=4000

# Yalnızca geliştirme seed'i için
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=guclu-bir-gelistirme-parolasi
```

`ICAL_ENCRYPTION_KEY` en az 16 karakter olmalı ve üretimde yedeklenmelidir. Bu anahtar kaybolursa kayıtlı iCal kaynak adresleri çözülemez.

Yeni ve boş bir geliştirme veritabanında şemayı oluşturup özel PostgreSQL kısıtlarını uygulayın:

```sh
npm run db:push
npx prisma db execute --file prisma/sql/20260906_availability_foundation.sql --schema prisma/schema.prisma
npx prisma db execute --file prisma/sql/20260906_booking_core.sql --schema prisma/schema.prisma
npx prisma db execute --file prisma/sql/20260906_calendar_management.sql --schema prisma/schema.prisma
npx prisma db execute --file prisma/sql/20260907_ical_sync.sql --schema prisma/schema.prisma
npx prisma db execute --file prisma/sql/20260907_booking_payment.sql --schema prisma/schema.prisma
npm run db:seed
npm run dev
```

Seed komutu geliştirme verisi içindir ve mevcut kayıtları temizler. Gerçek veritabanında çalıştırmayın. Mevcut veya canlı bir veritabanında önce yedek alın, ardından yalnızca eksik SQL dosyalarını sırayla uygulayın. Migration ayrıntıları ve güvenli geçiş notları [backend/prisma/sql/README.md](backend/prisma/sql/README.md) içindedir.

Backend varsayılan olarak `http://localhost:4000/api` adresinde çalışır.

### Frontend

İkinci terminalde:

```sh
cd frontend
npm install
```

`frontend/.env.local` dosyasını oluşturun:

```dotenv
NEXT_PUBLIC_API_URL=http://localhost:4000/api
API_URL=http://localhost:4000/api
```

Ardından:

```sh
npm run dev
```

Site `http://localhost:3000`, admin girişi `http://localhost:3000/admin/login` adresindedir.

## Doğrulama

Günlük güvenli kontroller:

```sh
cd backend
npm run build
npm run test:availability
npm run test:payment
npm run test:ical-parser
npm run test:ical-security
npx prisma validate

cd ../frontend
npm run build
```

Yarış ve iCal senkronizasyon testleri kayıt oluşturup temizlediği için yalnızca seed edilmiş, geçici bir PostgreSQL veritabanında çalıştırılmalıdır:

```sh
cd backend
ALLOW_BOOKING_TEST=1 DATABASE_URL=postgresql://... npm run test:booking-concurrency
ALLOW_ICAL_TEST=1 DATABASE_URL=postgresql://... ICAL_ENCRYPTION_KEY=test-icin-uzun-bir-anahtar npm run test:ical-sync
```

Testlerde kullanılan `DATABASE_URL` gerçek veya paylaşılan geliştirme veritabanını göstermemelidir.

## Rezervasyon ve iCal davranışı

- Rezervasyon, manuel blok ve iCal kayıtları aynı villa kilidi altında değerlendirilir.
- Aktif `HOLD` ve `CONFIRMED` rezervasyonların çakışması PostgreSQL seviyesinde de engellenir.
- iCal bağlı villa `REQUEST` moduna geçer. Zorunlu kaynak ilk kez eşitlenmediyse veya son başarı 60 dakikadan eskiyse kesin rezervasyon kapatılır; kullanıcı rezervasyon talebi gönderebilir.
- Senkronizasyon yaklaşık 15 dakikada bir çalışır. Hatalı veya boş dosya mevcut kapalı tarihleri açmaz.
- Açık iptal hemen uygulanır; dosyadan kaybolan olay iki başarılı görüntüden sonra serbest bırakılır.
- Import URL'leri şifreli saklanır ve arayüzde maskelenir. Yalnızca HTTPS kabul edilir; özel ağ hedefleri, büyük dosyalar, uzun istekler ve yönlendirme zincirleri engellenir.
- Export yalnızca onaylı yerel rezervasyonları ve yerel kapatmaları yayımlar. Misafir bilgisi, özel not, bekletme ve import edilmiş dış olay içermez.

Canlı pilotta villa düzenleme ekranından önce kaynağı önizleyin, sonra bağlayın. İlk başarılı eşitlemeden sonra kaynak sağlığını, kapsama tarihlerini ve çakışma sayısını aynı bölümden kontrol edin. Üretilen export bağlantısı bir sırdır; yenilendiğinde eski bağlantı geçersiz olur.

## Kiralama akışı ve kapora

1. Misafir villa detayında tarih ve kişi sayısını seçer; takvim her gecenin fiyatını gösterir, sağdaki kutu toplamı ve kaporayı canlı hesaplar.
2. **Rezervasyona devam et** ile detay adımına geçilir. Oturum zorunludur; iletişim bilgileri hesaptan doldurulur.
3. Onaylandığında 10 dakikalık `HOLD` açılır ve ödeme adımı görünür: kapora tutarı, admin tanımlı IBAN ve rezervasyona özel havale açıklaması (`MV-XXXXXX`).
4. Misafir **Havaleyi gönderdim** dediğinde kayıt `DECLARED` olur ve bekletme adminin belirlediği süre kadar (varsayılan 24 saat) uzatılır — dekont incelenirken geceler açılmaz.
5. Admin **Yönetim → Rezervasyonlar** listesini durum, villa, ödeme, kanal ve konaklama tarihine göre filtreler. Rezervasyon detayında misafir, ücret ve işlem geçmişini birlikte görüp havaleyi doğruladığında kayıt `CONFIRMED`, ödeme `PAID` olur. Sürüm kontrolü aynı rezervasyona eş zamanlı işlem yapılmasını engeller.

Takvim operasyonel doluluk görünümü olarak `/admin/takvim` altında kalır. Rezervasyon değiştirme, onay ve iptal işlemleri `/admin/rezervasyonlar/[id]` detay ekranından yapılır.

Tutarlar tek bir yerde, backend'deki `quoteStay` ile hesaplanır; arayüz para aritmetiği yapmaz. Kapora oranı/sabit tutarı, ödeme süresi ve IBAN **Yönetim → Ödeme ayarları** ekranından belirlenir. Bu ayarlar halka açık uçtan yayınlanmaz; IBAN yalnızca kendi rezervasyonunu görüntüleyen misafire döner.

Hasar depozitosu (`depositAmount`) kaporadan ayrıdır: girişte alınır, çıkışta iade edilir.

## Proje yapısı

```text
backend/
  prisma/schema.prisma       Veri modeli
  prisma/sql/                Veri koruyan, elle uygulanan SQL migration'ları
  src/bookings/              Rezervasyon, müsaitlik kilidi, takvim ve audit
  src/ical/                  Güvenli indirme, parser, senkronizasyon ve export
  src/villas/                Villa yönetimi, public liste ve müsaitlik
frontend/
  app/                       Site, admin ve ev sahibi sayfaları
  components/site/           Public villa ve müsaitlik arayüzleri
  components/admin/          Rezervasyon listesi/detayı ve yönetim takvimi
  components/villas/         Ortak villa düzenleme formu ve iCal kaynak ekranı
docs/plans/                  Ürün ve teknik uygulama planları
```

## Sonraki adım

1. Sınırlı sayıdaki bir villa için gerçek sağlayıcı iCal kaynağını bağlayın.
2. Sağlayıcıda bir test blokajı oluşturup import gecikmesini ve tarih sınırlarını ölçün.
3. My Villa export bağlantısını sağlayıcıya ekleyip onaylı rezervasyon ve manuel kapatma davranışını doğrulayın.
4. Çakışma ve kaynak hatası ekranlarını operasyon sorumlusuyla kabul testinden geçirin.
5. Kapora akışını gerçek bir havaleyle uçtan uca deneyin: ayarları girin, rezervasyon açın, bildirim yapın ve admin onayını doğrulayın.
6. Hacim arttığında otomatik dekont eşleştirmesi veya POS entegrasyonunu değerlendirin; mevcut akış `paymentStatus` üzerinden genişletilebilir.
