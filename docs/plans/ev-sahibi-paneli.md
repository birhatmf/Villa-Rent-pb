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
| `HostApplication` onayı yalnızca bir durum alanıydı; başvurudan sonra ayrıca hesap açılıyor veya elle bağlanıyordu | Başvuru yalnızca giriş yapmış `GUEST` hesabından açılır ve `linkedHostId` başta yazılır. Admin onayı başvuruyu ve aynı kullanıcıyı atomik olarak `HOST` yapar; yeni hesap/geçici şifre dalı kaldırıldı. Aynı kullanıcı için ikinci aktif başvuru kısmi unique index ile engellenir |
| `submitForReview` sunucu tarafında mevcut durumu doğrulamıyordu | Tek satır `ConflictException` guard'ı eklendi |

## 3. Onboarding akışı

1. Başvuru sahibi `/kayit?next=/ev-sahibi` üzerinden ad, e‑posta, telefon ve şifreyle `GUEST` hesabını oluşturur veya mevcut müşteri hesabıyla giriş yapar.
2. `/ev-sahibi` formu yalnızca `GUEST` hesabına açılır. E‑posta ve telefon hesaptan alınır; başvuru oluşturulurken `linkedHostId` yazılır.
3. Admin `/admin/ev-sahipleri/:id` ekranında belgeleri inceler. **Onayla** işlemi başvuruyu `APPROVED`, bağlı kullanıcıyı `HOST` yapar ve eski oturumu aynı transaction içinde geçersiz kılar. Red halinde kullanıcı `GUEST` kalır.
4. Admin villa düzenleme ekranındaki **Sahip** alanından mevcut bir villayı bu hesaba atar.
5. `HostApplication` kalıcı kaynak kayıt olarak durur; iban/ruhsat no/kapasite gibi alanlar başka tabloya kopyalanmaz.

`User.role` tek enum alanıdır. Customer API'leri yalnızca `GUEST`, owner API'leri yalnızca `HOST`, admin API'leri yalnızca `ADMIN` kabul eder. Admin üye ekranından `HOST` rolü verilemez; bu geçiş yalnızca onaylı başvuru üzerinden yapılır.

## 4. Owner paneli (tamamlandı)

- **Ortak panel kabuğu** — admin panelindeki daraltılabilir sol menü owner için de kullanılır. Genel bakış, villalar, yeni villa, rezervasyonlar, doluluk takvimi ve yorumlar tek navigasyondadır; mobilde aynı modüller yatay araç menüsünde görünür.
- **Operasyon özeti** (`/hesabim/ev-sahibi`) — karar bekleyen rezervasyon talepleri, havale bildirilen bekletmeler, aktif konaklamalar, yaklaşan girişler, portföy durumları, aylık net kazanç ve son takvim hareketleri birlikte gösterilir. Hepsi mevcut host uçlarından client-side toplanır, yeni tablo yok.
- **Başvuru bilgileri kartı** — yeni `GET /host/onboarding` (`HostOnboardingController`), owner'ın bağlı `HostApplication`'ından iban/ruhsat no/kapasite/adresi salt okunur döner.
- **Takvim sekmesi** (`/hesabim/ev-sahibi/takvim`) — daha önce hiçbir frontend'in çağırmadığı `GET /host/calendar` ve `GET /host/calendar/audit`'i kullanır. `BookingCalendar` bileşeni `scope: 'admin'|'host'` alacak şekilde genişletildi: host görünümünde rezervasyon/blok oluşturma paneli yok (villa düzenleme ekranındaki Takvim sekmesiyle çakışmasın diye kasıtlı olarak dışarıda bırakıldı), yalnızca çok-villalı görünüm ve rezervasyon detayına geçiş var.
- **Owner iptal talebi** — `POST /host/bookings/:id/cancellation-request`, `BookingServiceRequest` içinde takip edilebilir iptal talebi açar. Owner kendi talebini geri çekebilir; kapora iadesi nedeniyle son karar ve iade durumu yalnızca admin tarafından verilir.

## 5. Sonraki adım (planlandı, bu turda kurulmadı)

- **Bildirimler** — havale bildirildiğinde/rezervasyon onaylandığında/iptal talebi geldiğinde kimseye haber gitmiyor; bu, customer planındaki Aşama C3 (`NotificationOutbox`) ile birlikte çözülecek, burada tekrar ele alınmadı.
