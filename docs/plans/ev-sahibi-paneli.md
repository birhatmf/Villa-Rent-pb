# Ev sahibi (owner) paneli ve onboarding planı

Son inceleme: **8 Eylül 2026**

Bu belge, ev sahibi tarafındaki veri akışını ve onay sistemlerini inceler; onboarding zincirini kapatan, komisyon modelini iş kuralına oturtan ve panel kapsamını genişleten teslimi kaydeder.

## 1. İş kuralı

Kapora (misafirin admin'in IBAN'ına yaptığı havale) **platformun tüm komisyonudur** ve platformda kalır. Kalan tutar (`totalAmount - prepaymentAmount`) misafir ile ev sahibi arasında girişte, platform dışında kapanır — platform ona hiç dokunmaz. Bu kural şu sonuçları doğurur:

- Kapora onayını (havale doğrulama, rezervasyonu `PAID`/`CONFIRMED` yapma) **yalnızca admin** verebilir; ev sahibi platformun banka hesabını görmez, doğrulayamaz.
- Ev sahibinin "kazancı" ayrı bir hakediş/payout hesabı değil, `totalAmount - prepaymentAmount`'ın kendisidir — salt okunur gösterilir, ayrı bir defter tutulmaz.
- Onaylanmış (kapora platforma yatmış) bir rezervasyonu iptal etme kararı da admin'e aittir; ev sahibi yalnızca kendi ödenmemiş bekletmesini bırakabilir.

## 2. Bulunan boşluklar ve kapatılma şekli

| Boşluk | Kapatma |
| --- | --- |
| `Villa.commissionRate` alanı vardı, hiçbir hesapta okunmuyordu | `prepaymentFor()` artık üçüncü parametre olarak villa oranını alır; öncelik sabit tutar > villa oranı > genel oran. `Setting['payments'].defaultCommissionRate` (hiç okunmayan ikinci bir alan) admin ekranından kaldırıldı |
| Ev sahibi kapora onaylayabiliyordu (`POST /host/bookings/:id/confirm`) | Uç tamamen kaldırıldı; `BookingsService.confirm()` `hostId` verilirse `ForbiddenException` fırlatır |
| Ev sahibi onaylı rezervasyonu doğrudan iptal edebiliyordu | `BookingsService.cancel()` host + `CONFIRMED` kombinasyonunu reddeder; kendi `HOLD`'unu bırakması etkilenmez |
| Takvim (`calendar.service.ts`) ile rezervasyon detayı (`bookings.service.ts`) misafir iletişimini farklı kurallarla gizliyordu | Ortak `revealGuestContact(hostId, status)` yardımcısı (`bookings/payment.ts`) her iki dosyada da kullanılıyor: admin her zaman görür, host yalnızca `CONFIRMED` olunca |
| `GET /host/calendar/audit`, onaylanmamış rezervasyonda misafirin gerçek adını `actor.name` üzerinden sızdırıyordu | `CalendarService.audit()` artık `BookingsService.getAdmin()` ile aynı maskeleme kuralını uyguluyor |
| `HostApplication` onayı yalnızca bir durum alanıydı — hiçbir `User`/`Villa` oluşmuyor, `hostId` hiç atanamıyordu | `HostApplication.linkedHostId` eklendi; `POST /admin/host-applications/:id/link-host` onaylı başvuruyu mevcut bir kullanıcıya (GUEST ise HOST'a yükseltilir) veya yeni oluşturulan bir HOST hesabına bağlar. `PATCH /admin/villas/:id/host` (yeni) admin'in mevcut bir villayı bir ev sahibine atamasını sağlar — daha önce bu mümkün değildi |
| `submitForReview` sunucu tarafında mevcut durumu doğrulamıyordu | Tek satır `ConflictException` guard'ı eklendi |

## 3. Onboarding akışı

1. Başvuru sahibi `/ev-sahibi`'den (girişsiz) başvurur.
2. Admin `/admin/ev-sahipleri/:id`'de belgeleri inceler, **Onayla** der.
3. Admin aynı ekranda **Hesap Bağlama** bölümünden: mevcut bir üyenin id'sini girip bağlar (rolü GUEST ise HOST'a yükselir) **veya** "Yeni ev sahibi hesabı oluştur" der — başvurudaki ad/e‑posta/telefonla bir `HOST` hesabı açılır, rastgele bir geçici şifre **yalnızca o yanıtta bir kere** döner. Repoda e‑posta/SMS altyapısı olmadığı için admin bu şifreyi başvurudaki telefonla elden iletir.
4. Admin, villa düzenleme ekranındaki **Sahip** alanından (veya `PATCH /admin/villas/:id/host`) mevcut bir villayı bu hesaba atar.
5. `HostApplication` kalıcı kaynak kayıt olarak durur — iban/ruhsat no/kapasite gibi alanlar başka bir tabloya kopyalanmaz, yalnızca `linkedHostId` ile hangi hesaba bağlandığı işaretlenir.

## 4. Sonraki adım (planlandı, bu turda kurulmadı)

- **Owner dashboard/takvim sekmeleri** — `GET /host/calendar` zaten var ama hiçbir frontend onu çağırmıyor; salt okunur bir özet/takvim sekmesi eklenebilir. Yeni tablo gerekmez.
- **Owner'dan CONFIRMED iptal talebi** — şu an ev sahibine yalnızca "yönetimle iletişime geçin" notu gösteriliyor. `docs/plans/customer-hesap-rezervasyon-yorum.md` §5'teki `BookingServiceRequest` modeli kurulduğunda owner tarafı da aynı tabloyu (`requestedBy = hostId`) kullanmalı — ikinci bir mekanizma icat edilmemeli.
- **Bildirimler** — havale bildirildiğinde/rezervasyon onaylandığında kimseye haber gitmiyor; bu, customer planındaki Aşama C3 (`NotificationOutbox`) ile birlikte çözülecek, burada tekrar ele alınmadı.
