# Elle uygulanan veri migration'ları

Bu projede henüz Prisma Migrate geçmişi yok; mevcut veritabanı `prisma db push` ile oluşturulmuş. Bu nedenle buradaki SQL dosyaları `prisma migrate deploy` tarafından otomatik çalıştırılmaz.

`20260906_availability_foundation.sql` mevcut veriyi korur, ancak şu iki durumda hiçbir değişiklik yapmadan transaction'ı durdurur:

- tarih alanlarında gece yarısından farklı saat bulunması;
- aynı villada çakışan sezon fiyatı kuralları bulunması.

Önce veritabanı yedeği alınmalı ve hedef ortamda yukarıdaki kontroller çalıştırılmalıdır. Ardından backend dizininden şu komut uygulanabilir:

```sh
npx prisma db execute --file prisma/sql/20260906_availability_foundation.sql --schema prisma/schema.prisma
```

SQL tekrar çalıştırılabilir yapıdadır. `btree_gist` eklentisini açma yetkisi yoksa işlem atomik olarak geri alınır; veritabanı yöneticisi eklentiyi açtıktan sonra yeniden çalıştırılır.

`20260906_booking_core.sql`, Aşama 1'den sonra rezervasyon tablosunu ve aktif `HOLD`/`CONFIRMED` aralıklarının aynı villada çakışmasını engelleyen veritabanı kısıtını ekler:

```sh
npx prisma db execute --file prisma/sql/20260906_booking_core.sql --schema prisma/schema.prisma
```

`20260906_calendar_management.sql`, takvim bloklarına sürüm alanı ve rezervasyon/takvim işlem geçmişini ekler:

```sh
npx prisma db execute --file prisma/sql/20260906_calendar_management.sql --schema prisma/schema.prisma
```

`20260907_ical_sync.sql`, iCal kaynakları, senkronizasyon çalışmaları, dış takvim blok kimlikleri ve güvenli export token alanlarını ekler:

```sh
npx prisma db execute --file prisma/sql/20260907_ical_sync.sql --schema prisma/schema.prisma
```

`20260907_booking_payment.sql`, rezervasyon kaporası ve havale bildirimi alanlarını ekler. Mevcut rezervasyonlar `paymentStatus = 'NONE'` kalır; ödeme akışından önce açıldıkları için geriye dönük kapora borcu oluşmaz:

```sh
npx prisma db execute --file prisma/sql/20260907_booking_payment.sql --schema prisma/schema.prisma
```

`Booking_prepayment_range` kısıtı kaporanın 0 ile toplam tutar arasında kalmasını garanti eder; rezervasyon tarihleri değiştiğinde kapora yeniden hesaplanır.

`20260908_customer_account.sql`, aktif oturumları parola değişiminden sonra anında
geçersiz kılan hesap sürümünü ve profil güncelleme zamanını ekler:

```sh
npx prisma db execute --file prisma/sql/20260908_customer_account.sql --schema prisma/schema.prisma
```

`20260908_host_onboarding_link.sql`, onaylı bir ev sahibi başvurusunun gerçek bir
HOST hesabına bağlanabilmesi için `HostApplication.linkedHostId` alanını ekler.
Başvuru kalıcı kaynak kayıt olarak kalır; hiçbir alan başka tabloya kopyalanmaz:

```sh
npx prisma db execute --file prisma/sql/20260908_host_onboarding_link.sql --schema prisma/schema.prisma
```

`20260908_service_requests.sql`, C2 rezervasyon talebi, değişiklik/iptal talebi
ve manuel kapora iadesi durumlarını ekler. `20260908_verified_reviews.sql` ise C4 doğrulanmış yorumları,
tek owner yanıtını ve puan bütünlüğü kısıtlarını ekler:

```sh
npx prisma db execute --file prisma/sql/20260908_service_requests.sql --schema prisma/schema.prisma
npx prisma db execute --file prisma/sql/20260908_verified_reviews.sql --schema prisma/schema.prisma
```

iCal kaynak URL'leri veritabanında AES-256-GCM ile şifrelenir. Üretimde en az 16 karakterlik, yedeklenen ve yalnızca backend tarafından bilinen `ICAL_ENCRYPTION_KEY` tanımlanmalıdır. Tanımlı değilse mevcut `JWT_SECRET` kullanılır; anahtar kaybolursa kayıtlı kaynak URL'leri çözülemez.

Kalıcı Prisma Migrate geçmişine geçerken önce mevcut şema için baseline oluşturulup bu migration uygulanmış olarak işaretlenmelidir. Canlı veritabanı resetlenmez ve veri silen seed komutu kullanılmaz.
