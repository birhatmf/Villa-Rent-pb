# Customer hesap, seyahat ve doğrulanmış yorum planı

Son inceleme: **8 Eylül 2026**

### Uygulama durumu

8 Eylül 2026'da C1'in ilk teslimi tamamlandı: customer seyahatleri ve owner gelen
rezervasyonları ayrı rotalara taşındı; customer listesine filtre ve sayfalama,
hesaba profil/parola değiştirme, tüm kişisel uçlara aktif hesap ve oturum sürümü
kontrolü eklendi. Admin rol/pasiflik değişiklikleri eski tokenları iptal ediyor;
son aktif admin ve bağlı villası olan owner korunuyor. Gerçek olmayan e-posta
bildirim metinleri kaldırıldı.

C2 talep/değişiklik/iptal akışı tamamlandı. C4 doğrulanmış yorum modülünde de
30 günlük uygunluk, rezervasyon başına tek yorum, 24 saatlik düzenleme, admin
moderasyonu, owner yanıtı ve public puan özeti hazırdır. C3 bildirim/outbox ve
konaklama talimatları sıradaki teslimdir.

Bu belge, mevcut kod üzerinden customer/misafir yolculuğunu inceler ve satış sonrası gerekli modülleri sıralar. Amaç ilk sürümde güvenilir bir hesap, rezervasyon self servis alanı ve yalnızca gerçekten konaklayan kişinin yorum yapabildiği sade bir sistem kurmaktır.

## 1. Mevcut durum

| Alan | Durum | Kodda bugün olan | Eksik veya risk |
| --- | --- | --- | --- |
| Üyelik oluşturma | Kısmen hazır | Ad, e-posta, telefon, parola, KVKK ve pazarlama tercihiyle kayıt; kayıt sonrası oturum | E-posta sahipliği doğrulanmıyor, parola tekrarı yok, onay metni sürümü saklanmıyor |
| Giriş/çıkış | Büyük ölçüde hazır | HTTP-only JWT, genel hata, hız sınırı, güvenli `next`, parola değiştirme ve oturum iptali | Parola sıfırlama ve aktif cihaz listesi yok |
| Profil | Kısmen hazır | Ad ve telefon düzenleme, e-posta/üyelik bilgisi görüntüleme | Doğrulamalı e-posta değişimi, hesap kapatma ve veri talebi yok |
| Favoriler | Hazır | Ekleme, kaldırma, hesapta listeleme ve her istekte aktif hesap kontrolü | Koleksiyon/paylaşım sonraki kapsam |
| Rezervasyon oluşturma | Hazır | Instant villada idempotent `HOLD`; talep villasında stok kapatmayan `REQUESTED`; kabul anında yeniden fiyat/stok kontrolü; hesaplı veya rezervasyona özel imzalı çerezle korunan üyesiz devam akışı | — |
| Kendi rezervasyonları | Hazır | `/hesabim/seyahatlerim` altında işlem gereken/yaklaşan/geçmiş/iptal filtreleri, sayfalama, sahiplik kontrollü detay ve C2 talep aksiyonları | Görsel durum zaman çizgisi C3 ile tamamlanacak |
| Rezervasyon değişikliği | Hazır | Müşteri fiyat/müsaitlik önizlemesiyle talep açar; admin/host karar anında yeniden doğrular | — |
| İptal | Hazır | Müşteri ve owner takip edilebilir talep açar; yalnızca admin iptal/iade kararını verir | POS olmadığı için banka iadesi manuel yürür |
| Bildirim | Yok | Durumlar hesap ekranından takip ediliyor; gönderilmeyen e-posta için vaat gösterilmiyor | E-posta sağlayıcısı, kuyruk/outbox ve gönderim kaydı yok |
| Konaklama bilgileri | Yok | Tarihler ve ödeme özeti var | Giriş adresi/talimatı, ev kuralları snapshot'ı, acil iletişim ve çıkış hatırlatması yok |
| Yorumlar | Hazır | Doğrulanmış konaklama uygunluğu, müşteri yorumları, moderasyon, host yanıtı ve transaction içinde puan güncellemesi | Migration hedef veritabanına uygulanmalı |
| Destek | Harici | WhatsApp/telefon/e-posta bağlantısı | Rezervasyona bağlı destek kaydı ve durum takibi yok |
| Belge/fiş | Yok | Ücret kırılımı ekranda var | Rezervasyon özeti veya tahsilat belgesi indirilemiyor |

## 2. Önce düzeltilmesi gereken ürün boşlukları

1. **Customer ve host rezervasyonlarını ayırın.** Misafirin seyahatleri `/hesabim/seyahatlerim`, host'un gelen rezervasyonları `/hesabim/ev-sahibi/rezervasyonlar` altında olmalı. “Rezervasyonlarım” iki farklı anlamda kullanılmamalı.
2. **Talep butonu gerçek kayıt açmalı.** `REQUEST` modunda iletişim sayfasına yönlendirmek yerine `REQUESTED` rezervasyon oluşturulmalı; customer ve operasyon aynı kaydın durumunu görmeli.
3. **Gerçek olmayan bildirim metinlerini kaldırın.** E-posta servisi devreye girene kadar “e-postanıza gönderildi” denmemeli. Bildirim modülü gelince bu söz tekrar eklenmeli.
4. **Sabit puan görünümünü gerçek yorumlara bağlayın.** `rating` ve `reviewCount`, yalnızca yayınlanan doğrulanmış konaklama yorumlarından transaction içinde hesaplanmalı.
5. **Admin rezervasyonunu hesaba bağlama yolu ekleyin.** `guestId = null` olan telefon/e-posta rezervasyonları, yalnızca doğrulanmış e-posta veya tek kullanımlık claim bağlantısıyla customer hesabına bağlanmalı.
6. **Aktif hesap kontrolünü bütün customer uçlarında uygulayın.** Favoriler dahil bütün kişisel uçlar veritabanındaki `active` değerini kontrol etmeli.

## 3. Hedef customer bilgi mimarisi

| Sayfa | Görev |
| --- | --- |
| `/hesabim` | Yaklaşan seyahat, ödeme/yorum aksiyonu ve favorilerden kısa özet |
| `/hesabim/seyahatlerim` | Aksiyon gereken, yaklaşan, geçmiş ve iptal edilen rezervasyonlar; sayfalama |
| `/hesabim/seyahatlerim/[id]` | Durum zaman çizgisi, ödeme, konaklama, değişiklik/iptal talebi, destek ve yorum |
| `/hesabim/profil` | Ad ve telefon düzenleme; doğrulamalı e-posta değiştirme |
| `/hesabim/guvenlik` | Parola değiştirme, parola sıfırlama ve aktif oturumlar |
| `/hesabim/favorilerim` | Kaydedilen villalar |
| `/hesabim/yorumlarim` | Yazılmayı bekleyen ve daha önce gönderilen yorumlar |
| `/hesabim/ev-sahibi/*` | Yalnızca host operasyonları; customer seyahatlerinden ayrı |

Header menüsü role göre ayrılır: GUEST “Hesabım”, “Seyahatlerim” ve “Yorumlarım”; HOST yalnızca ev sahibi paneli; ADMIN yalnızca yönetim paneli araçlarını görür. Profil ve güvenlik her girişli role açıktır. Her hesap tek role sahiptir.

## 4. Hesap ve kimlik modülü

### Kayıt akışı

Mevcut kayıt formu korunur. Aşağıdakiler eklenir:

- Parola tekrarı yalnızca frontend hatasını erken yakalar; backend yine tek parolayı doğrular.
- `emailVerifiedAt` eklenir. Kayıt sonrası yalnızca doğrulama ekranına yeten sınırlı oturum açılır; kişisel veriler, favoriler ve rezervasyon işlemleri e-posta doğrulanınca etkinleşir.
- Doğrulama token'ı uzun, rastgele, veritabanında hash'li, tek kullanımlık ve süreli olur.
- Yeniden doğrulama gönderimi hem IP hem hesap bazında sınırlanır.
- KVKK/gizlilik metninin `version`, `acceptedAt`, `source` bilgisi saklanır. Pazarlama izni ayrı ve geri alınabilir kalır.
- Kayıt, doğrulama ve parola sıfırlama cevapları hesap varlığını gereksiz biçimde sızdırmaz.

### Profil ve güvenlik

- Ad/telefon değişikliği `PATCH /auth/me` ile yapılır.
- E-posta değişikliği mevcut parola ile yeniden doğrulama, eski adrese uyarı ve yeni adres onayı ister.
- Parola değişikliği mevcut parola ister; başarılı olunca diğer oturumlar geçersizleşir.
- “Parolamı unuttum” bağlantısı e-postaya tek kullanımlık, süreli reset bağlantısı gönderir. Hesabın var olup olmadığına bakmadan aynı cevap döner.
- `sessionVersion` veya ayrı `Session` tablosu eklenerek parola değişikliği, hesap kapatma ve şüpheli durumda eski JWT'ler iptal edilir.
- Hesap kapatma, finansal/rezervasyon kayıtlarını fiziksel silmez; kişisel alanları saklama politikasına göre anonimleştirme kuyruğuna alır. Kesin süre ve kapsam hukuk danışmanıyla belirlenir.

Önerilen minimum modeller:

```text
User.emailVerifiedAt
User.updatedAt
User.sessionVersion
AccountToken(type, userId, tokenHash, expiresAt, usedAt, createdAt)
Consent(userId, type, version, acceptedAt, revokedAt, source)
```

Doğrulama ve parola sıfırlama için aynı `AccountToken` tablosu yeterlidir; iki ayrı token sistemi gerekmez.

## 5. Rezervasyon self servis modülü

### Customer liste ve detay

`GET /bookings` şu filtreleri alır: `scope=action-required|upcoming|past|cancelled`, `page`, `pageSize`. Sıralama aksiyon gerekenlerde son tarih, yaklaşanlarda giriş tarihi, geçmişte çıkış tarihidir.

Detay sayfası şunları gösterir:

- Rezervasyon referansı ve durum zaman çizgisi
- Villa, giriş/çıkış, misafir dağılımı ve snapshot ev kuralları
- Ücret, kapora, kalan tutar, ödeme ve varsa iade durumu
- Havale bildirimi ve son işlem zamanı
- İzin verilen aksiyon: bekletmeyi bırak, değişiklik iste, iptal iste, destek al, yorum yaz
- Girişe yaklaşıldığında adres, check-in talimatı ve acil iletişim

### Talep modundaki villa

Yeni durumlar:

```text
REQUESTED -> HOLD -> CONFIRMED
REQUESTED -> DECLINED
REQUESTED -> WITHDRAWN
HOLD -> CONFIRMED | EXPIRED | CANCELLED
CONFIRMED -> CANCELLED
```

`REQUESTED`, villa stokunu kapatmaz. Host/admin talebi kabul ettiğinde müsaitlik villa kilidi altında tekrar kontrol edilir ve ödeme süreli `HOLD` oluşturulur. Aynı geceler bu sırada satılmışsa talep “artık müsait değil” sonucuyla kapanır; ikinci rezervasyon yaratılmaz.

Mevcut `Booking` tablosu fiyat ve müşteri snapshot'ını zaten taşıdığı için talep için ikinci bir ana rezervasyon tablosu kurulmaz; `BookingStatus` genişletilir. PostgreSQL çakışma kısıtı yalnızca `HOLD` ve `CONFIRMED` için çalışmaya devam eder.

### Değişiklik ve iptal talebi

Onaylı rezervasyonu customer doğrudan değiştirmez. Aşağıdaki tek genel talep modeli yeterlidir:

```text
BookingServiceRequest
- id, bookingId, requestedBy
- type: CHANGE | CANCELLATION
- status: PENDING | APPROVED | REJECTED | WITHDRAWN
- payload Json
- customerNote, resolutionNote
- version, createdAt, resolvedAt, resolvedBy
```

- Tarih değişikliği gönderilirken yeni tarih için fiyat ve müsaitlik önizlemesi gösterilir; onay anında tekrar kontrol edilir.
- Aynı rezervasyon ve talep türü için tek aktif `PENDING` kaydı veritabanı kısıtıyla korunur.
- İptal ekranı işlemi göndermeden önce uygulanacak politika, elde edilen ödeme ve tahmini manuel iade tutarını gösterir.
- POS olmadığı sürece customer'a otomatik iade sözü verilmez. Admin iadenin banka üzerinden tamamlandığını ayrıca kaydeder.
- İptal politikası ve müşteri tarafından kabul edilen sürüm, rezervasyon oluşturulurken snapshot olarak saklanır; sonradan değişen metin eski rezervasyona uygulanmaz.

## 6. Transactional bildirim modülü

Bugünkü kod e-posta göndermez. Rezervasyon ve ödeme gibi kritik işlemlerde doğrudan controller içinde e-posta göndermek yerine küçük bir outbox kullanılır:

```text
NotificationOutbox
- id, userId, bookingId, channel, template, payload
- status: PENDING | SENT | FAILED
- attempts, nextAttemptAt, sentAt, lastError, createdAt
```

Rezervasyon transaction'ı ile outbox satırı birlikte yazılır. Mevcut iCal işçisi gibi basit bir zamanlayıcı bekleyen satırları gönderir; başlangıçta Redis veya ayrı mesaj kuyruğu gerekmez.

İlk zorunlu olaylar:

1. E-posta doğrulama ve parola sıfırlama
2. Talep/bekletme oluşturuldu
3. Havale bildirimi alındı
4. Rezervasyon onaylandı, reddedildi veya iptal edildi
5. Ödeme/bekletme son tarihi yaklaşıyor
6. Girişten 3 gün ve 1 gün önce talimat
7. Çıkış günü ve yorum daveti

Gönderim tekrarları idempotent olur; `template + bookingId + eventKey` benzersizliği aynı olay için çift e-postayı önler.

## 7. Doğrulanmış konaklama yorum modülü

### Yorum uygunluğu

Backend bir customer'a ancak bütün koşullar sağlanınca yazma izni verir:

- Rezervasyonun `guestId` değeri oturumdaki kullanıcıdır.
- Rezervasyon `CONFIRMED` ve ödeme `PAID` veya ödeme gerektirmeyen `NONE` durumundadır.
- Villanın saat diliminde çıkış zamanı geçmiştir.
- Rezervasyon iptal edilmemiştir.
- Yorum süresi dolmamıştır. İlk ürün kararı: çıkıştan sonra **30 gün**.
- Aynı rezervasyon için daha önce yorum yoktur. `bookingId @unique` yarış halinde de ikinci yorumu engeller.
- Customer villanın sahibi değildir; kendi villasına doğrulanmış puan üretemez.

`COMPLETED` rezervasyon durumu eklemek gerekmez; geçmiş/gelecek bilgisi `checkOut` ve villa saat diliminden türetilebilir. No-show veya uyuşmazlık oluşursa admin rezervasyonu yorum hakkına kapatabilmelidir.

### Minimum veri modeli

```text
Review
- id
- bookingId @unique
- villaId
- authorId
- rating Int (1..5)
- comment String (20..2000)
- status: PUBLISHED | HIDDEN
- hiddenReason, hiddenAt, hiddenBy
- createdAt, updatedAt

ReviewResponse
- id
- reviewId @unique
- authorId
- comment String (1..1000)
- createdAt, updatedAt
```

İlk sürümde tek genel puan ve yorum yeterlidir. Temizlik, doğruluk, iletişim, konum ve fiyat/değer alt puanları; fotoğraflı yorum, faydalı oyu ve müşteri sadakat puanı gerçek kullanım ihtiyacı oluşana kadar eklenmez.

### Yayın ve moderasyon

- Uygunluk kontrolünü geçen yorum “Doğrulanmış konaklama” etiketiyle yayınlanır.
- Negatif yorum sırf düşük puan verdiği için gizlenmez. Admin yalnızca açık bir moderasyon nedeni seçerek gizleyebilir; işlem audit'e yazılır.
- Host yayınlanan yoruma bir kez cevap verebilir; customer yanıt zinciri açılmaz.
- Customer yorumunu 24 saat içinde düzenleyebilir. Sonrasında kaldırma talebi destek üzerinden yürür.
- Public villa uçları yalnızca `PUBLISHED` yorumları sayfalar. `Villa.rating` ve `reviewCount` aynı transaction içinde yayınlanan yorumlardan yeniden hesaplanır; admin elle puan yazamaz.
- Liste ve detay sayfasında yıldızların yanında yorum sayısı, dağılım ve en yeni doğrulanmış yorumlar görünür.

Önerilen uçlar:

```text
GET    /villas/:slug/reviews?page=&pageSize=
GET    /reviews/eligible
GET    /reviews/mine
POST   /bookings/:bookingId/review
PATCH  /reviews/:id
POST   /host/reviews/:id/response
PATCH  /admin/reviews/:id/moderation
```

### Yorum kabul testleri

- Başkasının, iptal edilmiş, henüz bitmemiş veya ödeme onayı olmayan rezervasyonuna yorum yazılamaz.
- Aynı rezervasyona eşzamanlı iki istekten yalnızca biri başarılı olur.
- Çıkış günü hesabı sunucu UTC'sine göre kaymaz; villa saat dilimi ve check-out saati kullanılır.
- Gizleme/yayınlama ve puan değişikliği ortalama ile sayıyı doğru günceller.
- Public cevaplarda e-posta, telefon, booking kimliği ve iç moderasyon notu bulunmaz.
- Host yalnızca kendi villasındaki yoruma cevap verebilir.

## 8. Rezervasyon sonrası yardımcı modüller

| Modül | İlk sürüm | Sonra |
| --- | --- | --- |
| Konaklama talimatları | Admin/host'un rezervasyona özel metni; girişten önce görünür | Akıllı kilit/kod entegrasyonu |
| Destek | Rezervasyon referanslı WhatsApp/e-posta bağlantısı | Uygulama içi mesajlaşma ve SLA |
| Belge | Yazdırılabilir rezervasyon özeti ve ödeme bilgisi | Mali mevzuata uygun e-fatura entegrasyonu |
| Yeniden rezervasyon | Geçmiş seyahatten aynı villaya dön | Kişiselleştirilmiş öneri |
| Favoriler | Mevcut yapı korunur | Koleksiyonlar ve paylaşım |
| Pazarlama tercihi | Hesaptan aç/kapat ve audit | Segmentasyon/otomasyon |

Kupon, cüzdan, sadakat programı, sosyal giriş, MFA/passkey, canlı sohbet, yorum fotoğrafı ve tavsiye motoru ilk customer tesliminin parçası değildir. Kullanım veya operasyon ihtiyacı ölçülünce eklenir.

## 9. Uygulama sırası

### Aşama C1 — Customer hesabı ve seyahat merkezi

- Guest/host rota çakışmasını düzeltin.
- `/hesabim/seyahatlerim` liste ve detayını ekleyin.
- Profil güncelleme, e-posta doğrulama, parola değiştirme/sıfırlama ekleyin.
- Güvenli dahili `next` yönlendirmesi ve bütün customer uçlarında aktif hesap kontrolü uygulayın.
- Gerçek e-posta yokken yanlış bildirim metinlerini düzeltin.

**Bitiş koşulu:** Yeni customer kayıt olabilir, e-postasını doğrular, giriş yapar, bütün kendi rezervasyonlarını sayfalı ve yetkili biçimde görür; başka customer'ın kaydını göremez.

### Aşama C2 — Talep, değişiklik ve iptal

**Durum: Tamamlandı (8 Eylül 2026).**

- `REQUESTED/DECLINED/WITHDRAWN` akışını `Booking` içinde ekleyin.
- `BookingServiceRequest` ile değişiklik ve iptal talebini ekleyin.
- Rezervasyon anındaki koşul/iptal snapshot'ını saklayın.
- Admin ve host detay ekranına talep kararları ile manuel iade durumu ekleyin.

**Bitiş koşulu:** Talep modundaki villa gerçek kayıt açar; kabul anında stok tekrar doğrulanır; customer onaylı rezervasyon için takip edilebilir talep gönderebilir.

Uygulanan ek uçlar:

```text
POST /bookings/:id/change-preview
POST /bookings/:id/change-request
POST /bookings/:id/cancellation-request
POST /bookings/service-requests/:id/withdraw
POST /admin|host/service-requests/:id/resolve
POST /admin/service-requests/:id/refund
```

### Aşama C3 — Bildirim ve konaklama

- `NotificationOutbox` ve e-posta işçisini ekleyin.
- Rezervasyon olayları ile giriş/çıkış hatırlatmalarını bağlayın.
- Konaklama talimatı ve yazdırılabilir rezervasyon özetini ekleyin.

**Bitiş koşulu:** Veritabanında başarılı rezervasyon olayı kaybolmadan en az bir kez bildirim işlenir; tekrar çalışma çift bildirim üretmez.

### Aşama C4 — Doğrulanmış yorumlar

**Durum: Tamamlandı (8 Eylül 2026).**

- `Review` ve `ReviewResponse`, uygunluk servisi ve public listeyi ekleyin.
- Seyahat detayına “Yorum yaz”, hesaba “Yorumlarım”, villa detayına yorum listesi ekleyin.
- Host yanıtı, admin gerekçeli moderasyon ve aggregate puan güncellemesini ekleyin.

**Bitiş koşulu:** Yalnızca tamamlanmış ve kullanıcıya ait doğrulanmış konaklama bir kez yorumlanır; public ortalama yalnızca yayınlanan yorumlardan oluşur.

## 10. Dış referanslardan alınan kararlar

- OWASP, e-posta sahipliğinin doğrulanmasını; doğrulama/reset token'larının rastgele, tek kullanımlık ve süreli olmasını önerir. Ayrıca parola sıfırlamada hesap varlığını sızdırmayan tutarlı cevap ve hız sınırı ister: [Email Validation and Verification](https://cheatsheetseries.owasp.org/cheatsheets/Email_Validation_and_Verification_Cheat_Sheet.html), [Forgot Password](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html).
- Büyük konaklama platformlarında yorum hakkı check-out sonrasında ve süreli açılır; Airbnb örneğinde ev konaklamaları için pencere 14 gündür. My Villa için ilk öneri daha affedici 30 gündür ve ölçümle daraltılabilir: [Airbnb review window](https://www.airbnb.com/help/article/995).
- Yorumlar ilgili ve gerçek deneyime dayanmalı; düşük puan tek başına kaldırma nedeni sayılmamalıdır: [Airbnb Reviews Policy](https://www.airbnb.com/help/article/2673).
- Google'ın review structured data kuralları uygulanacaksa işaretlenen puan ve yorumlar sayfadaki kullanıcıya görünür içerikle aynı olmalıdır: [Google Review Snippet](https://developers.google.com/search/docs/appearance/structured-data/review-snippet).
