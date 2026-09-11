# VillaRentArea Security Audit

**Denetim tarihi:** 11 Eylül 2026  
**Hedef:** `0f3e348` commit'i ve mevcut yerel çalışma ağacı  
**Yöntem:** Strix beyaz-kutu yaklaşımı: keşfet → veri akışını izle → saldırı modeli kur → kanıtla. Düzeltmeler odaklı regresyon testleriyle yeniden doğrulandı; üretim ortamına istek gönderilmedi.

## Executive Summary

Rol denetimi, rezervasyon sahipliği, sunucu tarafı fiyat hesabı, çift rezervasyon yarışına karşı villa satır kilidi ve iCal SSRF savunması güçlü uygulanmış. İlk denetimdeki favorites veri sızıntısı ve kaynak tüketimi zinciri düzeltildi; JWT yapılandırması, global rate limit, dosya imza doğrulaması, owner yeniden inceleme akışı, guest capability iptali ve ana admin koruması da kod ve odaklı testlerle güvenceye alındı. Kalan riskler ağırlıkla dağıtık rate-limit store, migration operasyonu, MFA/recovery ve gözlemlenebilirliktir.

| Seviye | Adet |
| --- | ---: |
| Critical | 0 |
| High | 0 |
| Medium (kısmi/açık) | 1 |
| Low (kısmi/açık) | 3 |
| Info | 2 |

Kimlik doğrulama atlatma, SQL injection, komut çalıştırma, keyfi dosya yolu yazma, başka müşterinin rezervasyonuna erişme, istemci fiyat manipülasyonu veya çift rezervasyon yarışı doğrulanmadı.

## Kapsam ve Doğrulama Sınırları

Tüm NestJS controller, guard, DTO ve servisleri; Prisma şeması ve elle yönetilen SQL'ler; upload zinciri; Next.js API istemcileri ve render noktaları; nginx/systemd ayarları; ortam örnekleri; kurulum belgeleri; Git'teki hassas dosya adları ve kurulu bağımlılık ağaçları incelendi.

Çalıştırılan güvenli kontrollerin tamamı geçti:

- `npm run test:availability`
- `npm run test:payment`
- `npm run test:reviews`
- `npm run test:ical-parser`
- `npm run test:ical-security`
- Backend ve frontend için `npm audit --omit=dev --json`

Veri oluşturan/silen concurrency ve customer-access testleri çalıştırılmadı. Üretim alan adına istek gönderilmedi. Aktif firewall, TLS başlıkları, gerçek DB yetkileri, secret kalitesi ve PostgreSQL constraint'lerinin canlıdaki varlığı ayrıca deployment sırasında doğrulanmalıdır.

## Architecture

| Alan | Tespit edilen yapı |
| --- | --- |
| Backend | NestJS 11.2.3, Express, TypeScript |
| Frontend | Next.js 15.5.25, React 19.2.8, next-intl, Tailwind |
| Database/ORM | PostgreSQL, Prisma Client 6.19.3 |
| Authentication | HTTP-only `mv_token` cookie içinde JWT; alternatif Bearer desteği |
| Authorization | `JwtGuard` + `RolesGuard`; aktiflik, rol ve `sessionVersion` her korumalı istekte DB'den okunuyor |
| Password | bcryptjs; normal hesaplarda cost 10, bootstrap admin'de 12 |
| Stok kontrolü | Transaction içinde Villa satır kilidi; elle kurulan PostgreSQL exclusion constraint |
| Dosya sistemi | Yerel `backend/uploads`; villa/CMS görselleri public, owner başvuru belgeleri private |
| Reverse proxy | nginx → Next.js:3000 ve NestJS:4000; systemd `myvilla` kullanıcısı |
| Dış servisler | ECB döviz kuru ve owner tarafından girilen HTTPS iCal kaynakları |
| Cache | ECB için process içi 12 saat cache; Redis yok |
| Ödeme | Manuel banka havalesi; POS/webhook yok |
| Diğer | Email sağlayıcısı, GraphQL, WebSocket, Swagger, Docker ve CI workflow bulunmadı |

## Attack Surface

Public alan: villa arama/detay/müsaitlik, yorumlar, CMS, branding/footer, döviz kuru, kayıt/giriş, üyesiz rezervasyon ve rezervasyona özel capability cookie ile detay/ödeme bildirimi.

GUEST: kendi rezervasyonları, favorileri, doğrulanmış yorumları ve owner başvurusu. HOST: yalnızca `Villa.hostId` ile bağlı villa, rezervasyon, takvim, iCal, yorum ve onboarding kayıtları. ADMIN: kullanıcı, villa, rezervasyon, CMS, taxonomy, ayar, reklam slotu, owner başvurusu, yorum ve medya yönetimi.

Hassas veri: parola hash'leri, müşteri iletişim bilgileri, owner T.C./kimlik bilgileri, IBAN, mülkiyet belgeleri, ödeme durumu, moderasyon notları ve şifreli iCal URL'leri.

## Authentication & JWT Architecture

```text
Client → POST /api/auth/login → 7 günlük JWT → HttpOnly / Secure* / SameSite=Lax cookie
                                      ↓
                         JwtGuard imza ve süreyi doğrular
                                      ↓
                      RolesGuard kullanıcıyı DB'den yeniden okur
                       active + role + sessionVersion

Refresh token: yok
Logout / parola / rol / aktiflik değişimi → sessionVersion artar → eski JWT reddedilir
```

Token localStorage/sessionStorage'da tutulmuyor. JavaScript tarafından okunabilen `mv_user` yalnızca ad/rol içeriyor ve arayüz yönlendirmesinde kullanılıyor; backend bunu yetki kararı için kullanmıyor.

Doğrulanan iyi kontroller:

- JWT imzası ve `exp` değeri `verifyAsync` ile kontrol ediliyor.
- Token içindeki role güvenilmiyor; güncel rol DB'den okunuyor.
- Pasif kullanıcılar ve eski `sessionVersion` değerleri reddediliyor.
- Logout, parola/rol/aktiflik değişikliği mevcut oturumları geçersiz kılıyor.
- Login bilinmeyen kullanıcıda sahte bcrypt hash'i ve ortak hata mesajı kullanıyor.
- Cookie HTTP-only, host-only, `Path=/` ve SameSite Lax.
- Parola DTO'ları girdiyi 72 karakterde sınırlıyor. bcrypt'in gerçek sınırı 72 byte olduğu için çok baytlı Unicode parolalarda ayrıca byte-length kontrolü yapılmalı.

## Authorization Matrix

`User` tekil `GUEST`, `Owner` ise `HOST` rolüdür.

| Endpoint grubu | Anonymous | User | Owner | Admin | Nesne/politika kontrolü |
| --- | --- | --- | --- | --- | --- |
| Public villa, bölge, konsept, sayfa, yorum | İzin | İzin | İzin | İzin | Yalnız PUBLISHED villa; açık public DTO |
| `/api/auth/register,login,logout` | İzin | İzin | İzin | İzin | Login throttle; logout subject oturumunu iptal eder |
| `POST /api/guest-bookings/{holds,requests}` | İzin | İzin | İzin | İzin | `guestId=null`; rezervasyona özel capability üretir |
| `/api/guest-bookings/:id*` | Capability | Capability | Capability | Capability | Token `kind` ve `bookingId`; DB'de `guestId=null` |
| `/api/bookings*`, customer reviews | Ret | İzin | Ret | Ret | `guestId=req.user.sub` |
| `/api/favorites*` | Ret | İzin | Ret | Ret | Kullanıcı kapsamı ve yalnız PUBLISHED/OPEN public allowlist |
| `/api/host-applications*` | Ret | İzin | Ret | Ret | Kendi, PENDING başvurusu |
| `/api/host/villas*` | Ret | Ret | İzin | Ret | `Villa.hostId`; alt nesnenin villa eşleşmesi |
| Host booking/calendar/iCal/review | Ret | Ret | İzin | Ret | İlişkili villa `hostId` ile sınırlandırılıyor |
| `/api/admin/*` | Ret | Ret | Ret | İzin | Controller seviyesinde JWT + role guard |
| `GET /api/calendar/:token.ics` | Gizli URL | Gizli URL | Gizli URL | Gizli URL | 256-bit token DB'de hash; yalnız busy aralıkları |
| `GET /api/settings/:key` | İzin | İzin | İzin | İzin | Yalnız `footer`, `branding` |

## Confirmed Vulnerabilities

### VR-SEC-001 — Favoriler iç ve yayından kaldırılmış villa verisini sızdırıyor

**Severity:** HIGH  
**Category:** OWASP API1 BOLA / API3 Broken Object Property Level Authorization; CWE-200, CWE-639  
**Affected:** `backend/src/favorites/favorites.service.ts:8-37`; `GET /api/favorites`, `POST /api/favorites/:villaId`

**Vulnerable code:**

```ts
include: { villa: { include: { region: ..., images: ..., priceRules: ... } } }
const { priceRules: _drop, ...rest } = villa;
return { ...rest, priceRange: ... };
```

**Root cause:** Favori eklerken villanın yayın durumu kontrol edilmiyor. Listeleme tam Prisma Villa satırını getiriyor ve public alan allowlist'i yerine spread ediyor.

**Attack scenario:** GUEST, normal public API'den aldığı villa ID'lerini favoriler ve `GET /api/favorites` çağırır. Cevapta public mapper'ın özellikle dışladığı `commissionRate`, `hostId`, `reviewNote`, `reviewedBy` ve inceleme tarihleri görünür. Sonradan DRAFT/REJECTED durumuna dönen eski favori de görünmeye devam eder.

**Proof:** `backend/src/villas/villas.service.ts:443-481` public kart alanlarını açıkça seçer. Favorites satır 9-27 tam Villa kaydını getirip yayılmaktadır.

```http
POST /api/favorites/<public-villa-id>
Cookie: mv_token=<test-guest-token>

GET /api/favorites
Cookie: mv_token=<test-guest-token>
```

**Impact:** Komisyon stratejisi ve moderasyon içeriği toplu şekilde öğrenilebilir; yayından kaldırılan içerik müşteride görünür kalır.

**Remediation:** Add/list sorgusunda `status='PUBLISHED'` zorlayın ve `toCardData` ile aynı explicit select/mapper'ı kullanın. Yayından kalkınca favorinin silineceği mi gizleneceği mi belirlenmeli.

**Regression test:** GUEST draft/rejected villa ekleyememeli; eski favori unpublish sonrası görünmemeli; cevapta `hostId`, `commissionRate`, `reviewNote`, `reviewedBy`, `status` bulunmamalı.

**Status:** FIXED — doğrulandı (`test:favorites-security`). Listeleme yalnızca `PUBLISHED + OPEN` villaları ve açık alan allowlist'ini döndürüyor; ekleme de aynı yayın filtresini uyguluyor.

### VR-SEC-002 — Sınırsız upload sayısı bellek ve disk tüketimine izin veriyor

**Severity:** MEDIUM  
**Category:** OWASP API4 Unrestricted Resource Consumption; CWE-400, CWE-770  
**Affected:** `backend/src/villas/host-villas.controller.ts:99-109`, `backend/src/villas/villa-images.service.ts:24-60`, `backend/src/host-applications/host-applications.controller.ts:78-89`, `backend/src/host-applications/host-applications.service.ts:184-223`

**Root cause:** Dosya başına 10/15 MB sınır var; kullanıcı/villa/başvuru başına dosya adedi, toplam byte, depolama kapasitesi ve villa upload throttling'i yok. `memoryStorage` dosyayı yazmadan önce bütünüyle Node belleğinde tutuyor.

**Attack scenario:** Kötü niyetli veya ele geçirilmiş HOST sınırsız 15 MB villa görseli yükler. PENDING başvurusu olan GUEST mevcut 20/dakika sınırıyla yaklaşık 200 MB/dakika belge kalıcılaştırabilir.

**Proof:** Her istek yeni UUID dosyası ve DB satırı oluşturuyor; count/byte sorgusu yalnız görsel sırasını belirliyor, ret için kullanılmıyor. Host villa controller'da `ThrottlerGuard` yok.

**Impact:** Node heap baskısı, disk dolması, DB/log/upload hataları ve site kesintisi.

**Remediation:** Stream/quarantine depolama; Multer `files/fields/parts` limitleri; transaction içinde kullanıcı/villa/application count ve byte kotası; kimlik tabanlı throttle; disk alarmı; DB hatasında orphan cleanup.

**Regression test:** Kota sınırından sonraki eşzamanlı upload'lar 413/429 dönmeli ve dosya/DB sayısını artırmamalı.

**Status:** FIXED — doğrulandı (`test:upload-quota-security`). Villa başına 60 dosya/300 MB, başvuru başına 20 dosya/100 MB kotaları transaction içindeki satır kilidiyle uygulanıyor; Multer dosya/alan/part limitleri ve orphan cleanup eklendi.

### VR-SEC-003 — JWT yapılandırması exact production dışında bilinen fallback'e düşüyor

**Severity:** MEDIUM  
**Category:** OWASP Security Misconfiguration / Cryptographic Failures; CWE-321  
**Affected:** `backend/src/auth/auth.module.ts:14-24`

**Vulnerable code:**

```ts
if (!secret && config.get('NODE_ENV') === 'production') throw new Error(...);
return { secret: secret ?? 'dev-secret-degistir', signOptions: { expiresIn: '7d' } };
```

**Root cause:** `NODE_ENV` yoksa veya `prod` gibi başka bir değer taşıyorsa bilinen secret kullanılıyor. Exact production'da da herhangi bir non-empty secret kabul ediliyor; minimum entropy kontrolü yok.

**Attack scenario:** Hatalı kurulmuş bir production servisi bilinen fallback/çok kısa secret ile açılır. Saldırgan bilinen aktif kullanıcı ID'si ve güncel session version için token imzalayabilir. RolesGuard hayali kullanıcı/rolü engeller fakat mevcut admin impersonation'ını engellemez.

**Proof:** Fallback kaynak kodda sabit ve startup factory'de uzunluk/entropy doğrulaması yok. Kurulum belgesi doğru değer öneriyor; canlı secret'ın zayıf olduğu iddia edilmiyor.

**Impact:** Hatalı deployment halinde admin dahil tam hesap ele geçirme.

**Remediation:** Test dışındaki her ortamda secret zorunlu; en az 32 rastgele byte; merkezi config schema; explicit algoritma, issuer ve audience.

**Regression test:** Eksik, bilinen-default ve kısa secret ile production/production-benzeri startup başarısız olmalı; yanlış alg/iss/aud token reddedilmeli.

**Status:** FIXED — doğrulandı (`test:jwt-config-security`). Secret en az 32 byte zorunlu; HS256, issuer ve audience pinlendi.

### VR-SEC-004 — Yapılandırılmış rate limiter API'nin çoğunda çalışmıyor

**Severity:** MEDIUM  
**Category:** OWASP API4 / API2; CWE-307, CWE-770  
**Affected:** `backend/src/app.module.ts:53-58,97-115` ve `ThrottlerGuard` içermeyen controller'lar

**Root cause:** `ThrottlerModule.forRoot` yalnız ayarı sağlar; guard global `APP_GUARD` olarak kayıtlı değil. Sadece auth, customer booking, guest booking ve owner application controller'ları guard kullanıyor. Public DB sorguları, admin/host uçları, villa upload, iCal preview/create/sync ve calendar token lookup sınırsız. Depo process içi; login yalnız IP tabanlı.

**Attack scenario:** Anonymous istemci search/availability/CMS'i, ele geçirilmiş HOST iCal fetch/parse ve upload uçlarını tekrarlar. Dağıtık credential stuffing IP kovalarını aşar; çoklu instance bağımsız sayaç tutar.

**Proof:** AppModule providers içinde `APP_GUARD` yok; controller envanteri yalnız dört sınıfta throttler gösteriyor.

**Impact:** DB/CPU/network tüketimi ve zayıf credential-stuffing direnci.

**Remediation:** Guard'ı global kaydedip public read, login, upload ve outbound-fetch için ayrı policy; login'de normalize email+IP anahtarı; çoklu instance'ta ortak store.

**Regression test:** Temsilî public/host/admin uçları limitte 429 dönmeli; iki instance aynı kotayı, farklı IP'ler aynı hesap kotasını paylaşmalı.

**Status:** PARTIALLY FIXED — global `APP_GUARD`, login email kovası ve upload/iCal route limitleri eklendi (`test:rate-limit-security`). Çoklu instance için process dışı shared store hâlâ gereklidir.

### VR-SEC-005 — HOST, yayınlanmış villayı yeniden incelemeye sokmadan değiştirebiliyor

**Severity:** MEDIUM  
**Category:** OWASP API5 / business workflow bypass; CWE-840  
**Affected:** `backend/src/villas/host-villas.controller.ts:76-96`, `backend/src/villas/villas.service.ts:643-704,721-774`

**Root cause:** İlk yayın admin onayı istiyor; genel HOST update ise `commissionRate` dışında ilan, izin, fiyat, kural ve `videoUrl` alanlarını değiştirirken `PUBLISHED` durumunu koruyor.

**Attack scenario:** Owner kabul edilebilir içerikle onay alıp sonra açıklama, permit no, politika, fiyat veya harici video bağlantısını değiştirir; public API bunu hemen yayınlar.

**Proof:** Service satır 667-674 update sırasında status değiştirmiyor. `submitForReview` yalnız DRAFT/REJECTED için.

**Impact:** Moderasyon ve mevzuat kontrolü atlanabilir; yanıltıcı içerik/güvensiz link onaylı ilan altında yayınlanabilir.

**Remediation:** Canlı değiştirilebilir operasyonel alanları açıkça belirleyin. Materyal alanlarda pending revision veya `PENDING_REVIEW`; son onaylı snapshot onaya kadar public kalmalı.

**Regression test:** PUBLISHED villa üzerindeki her HOST alanı denenmeli; materyal değişiklik admin onayından önce public cevabı değiştirmemeli.

**Status:** FIXED — `PUBLISHED` bir villada owner'ın materyal alan değişiklikleri `PENDING_REVIEW` durumuna çekiliyor ve audit kaydı yazılıyor; fiyat gibi operasyonel alanlar canlı kalabiliyor (`test:owner-moderation-security`).

### VR-SEC-006 — Owner upload'ları client MIME değerine güveniyor

**Severity:** LOW  
**Category:** OWASP Security Misconfiguration; CWE-434  
**Affected:** `backend/src/villas/villa-images.service.ts:10-42`, `backend/src/host-applications/host-applications.service.ts:16-21,184-223`, `backend/src/host-applications/admin-host-applications.controller.ts:62-73`

**Root cause:** Extension ve response Content-Type `file.mimetype` üzerinden seçiliyor. Magic-byte, tam decode/re-encode, piksel limiti, malware tarama veya quarantine yok. Belgeler admin'e inline açılıyor.

**Attack scenario:** Owner/GUEST keyfi byte'ları `image/jpeg` veya `application/pdf` olarak saklar. Rastgele ad, uzantı ve Helmet `nosniff` public XSS riskini azaltıyor; private belgeler auth istiyor. Kalan risk dosya politikası atlatma ve admin viewer/parser maruziyetidir.

**Impact:** Geçersiz/polyglot dosya barındırma ve belgeyi inceleyen admin için istemci tarafı risk. Doğrudan server RCE veya stored XSS doğrulanmadı.

**Remediation:** Signature doğrulama, görsel decode/re-encode ve pixel sınırı, belge tarama, `Content-Disposition: attachment`, ayrı non-executable quarantine.

**Regression test:** İzinli MIME ile HTML/ZIP/random/polyglot ve image bomb fixture'ları reddedilmeli.

**Status:** PARTIALLY FIXED — owner/başvuru/admin upload'larında magic-byte doğrulaması, kotalar ve attachment disposition eklendi (`test:upload-signature-security`). Decode/re-encode ve malware taraması deployment katmanında kalıyor.

### VR-SEC-007 — Üyesiz rezervasyon capability'si 180 gün ve iptal edilemiyor

**Severity:** LOW  
**Category:** OWASP Identification and Authentication Failures; CWE-613  
**Affected:** `backend/src/bookings/guest-bookings.controller.ts:16-22,56-85`

**Root cause:** Stateless capability JWT 180 gün geçerli. DB'de capability version/hash yok; hold bırakıldığında, expire/cancel olduğunda cookie temizlenmiyor.

**Attack scenario:** Paylaşılan tarayıcı profilini alan veya cookie'yi çalan kişi kısa hold bittikten sonra da rezervasyon tarih/tutar/iletişim ve ödeme talimatlarını okuyabilir.

**Impact:** Anonymous müşteri için uzun süreli mahremiyet riski. HTTP-only, SameSite ve path scope riski azaltıyor.

**Remediation:** Süreyi iş ihtiyacına indirin; hash/version ile revoke; hassas transition'da rotate; cancellation/expiry sonrası cookie clear.

**Regression test:** Release/cancel/revoke sonrası eski token 404 almalı ve cookie temizlenmeli.

**Status:** FIXED — süre 30 güne indirildi; capability sürümü DB'de tutuluyor, expire/cancel/reject/release geçişlerinde artırılıyor ve release cookie'si temizleniyor (`test:guest-capability-security`).

### VR-SEC-008 — İlk ana admin ayırt edilmiyor ve korunmuyor

**Severity:** LOW  
**Category:** Privileged account governance; CWE-266  
**Affected:** `backend/prisma/schema.prisma:17-38`, `backend/prisma/create-admin.ts:18-35`, `backend/src/admin/users.service.ts:69-143`

**Root cause:** Model yalnız `role=ADMIN` tutuyor; immutable primary/super-admin işareti yok. Sistem self ve son aktif admin'i koruyor, fakat ikinci admin uygun koşullarda bootstrap admin'i pasifleştirebilir, düşürebilir veya silebilir.

**Attack scenario:** Ele geçirilmiş ikinci admin, asıl yönetici hesabını kapatıp kalıcılığını güçlendirir. Bu lower-role escalation değildir; admin compromise etkisini büyütür ve istenen ana-admin kuralını ihlal eder.

**Remediation:** Immutable primary-admin kimliği/policy, yalnız offline recovery ile değişim ve tüm privileged-account olayları için audit.

**Regression test:** Başka admin primary hesabı delete/deactivate/demote edememeli.

**Status:** FIXED — `isPrimaryAdmin` alanı, eski kurulum için idempotent SQL backfill'i ve admin CRUD koruması eklendi (`test:primary-admin-security`).

### VR-SEC-009 — Backend localhost-only niyetine rağmen tüm arayüzlerde dinliyor

**Severity:** LOW  
**Category:** OWASP Security Misconfiguration; CWE-668  
**Affected:** `backend/src/main.ts:13-16,47`, backend systemd unit, `docs/production-kurulum.md:72-80`

**Root cause:** `app.listen(port)` localhost'a bind etmez; güvenlik tamamen UFW/cloud firewall'a bağlı. Port 4000 doğrudan açılırsa nginx/TLS atlanır ve `trust proxy=1` ile forwarded IP spoofing rate limit'i etkiler.

**Proof:** Frontend unit açıkça `--hostname 127.0.0.1` kullanıyor; backend kullanmıyor. Belge 4000'in internete açılmaması gerektiğini söylüyor.

**Remediation:** Nest'i açıkça `127.0.0.1` üzerinde dinletin; firewall'u koruyun; trusted proxy'yi adresle daraltın.

**Regression test:** 4000 yalnız loopback'ten erişilebilir olmalı; doğrudan forged XFF `req.ip` değiştirmemeli.

**Status:** FIXED — backend artık yalnızca `127.0.0.1` üzerinde dinliyor; dış erişim nginx üzerinden kalıyor.

### VR-SEC-010 — Güvenlik constraint'leri takip edilen migration sisteminin dışında

**Severity:** LOW  
**Category:** OWASP Software and Data Integrity Failures; CWE-1188  
**Affected:** `backend/prisma/sql/README.md:1-4`, `20260906_booking_core.sql:67-110`, `20260908_service_requests.sql:54-68`

**Root cause:** Prisma Migrate geçmişi yok. `db push`, CHECK/exclusion/partial unique constraint'lerin bir kısmını kurmaz. Operatör ordered SQL listesini elle çalıştırıyor; hangi dosyanın uygulandığını gösteren migration tablosu yok.

**Attack scenario:** Deploy bir SQL'i atlar. Uygulama kilidi temel booking yolunu korumaya devam etse de DB defense-in-depth ve tek pending request invariant'i script/future path/concurrency altında kaybolur.

**Remediation:** Mevcut şemayı Prisma Migrate veya başka takipli sisteme baseline edin; checksum/state kaydı ve startup/deploy constraint smoke-check ekleyin.

**Regression test:** Boş DB tek desteklenen deploy komutuyla kurulunca beklenen named constraint/index'lerin tamamı bulunmalı.

**Status:** IMPROVED — security SQL dosyası artık primary-admin ve guest capability şemasını içeriyor, production kurulum sırasına ve `db:verify-security-schema` smoke-check'ine eklendi. Prisma Migrate baseline hâlâ ayrı bir operasyonel iş.

### VR-SEC-011 — Kayıt endpoint'i email üyeliğini açıklıyor

**Severity:** LOW  
**Category:** OWASP Identification and Authentication Failures; CWE-204  
**Affected:** `backend/src/auth/auth.service.ts:48-69`; `POST /api/auth/register`

**Root cause:** Login ortak hata kullanırken register unique collision'da açıkça “Bu e-posta adresi zaten kayıtlı” cevabı veriyor.

**Attack scenario:** Saldırgan candidate email'leri düşük hızda deneyip üyeliği 409 ile ayırır. 10/dakika/IP maliyeti yükseltir, distributed denemeyi engellemez.

**Impact:** Phishing ve credential-stuffing hedeflemesinde kullanılabilecek müşteri mahremiyeti sızıntısı.

**Remediation:** Nötr public cevap; email servisi geldiğinde ayrıntıyı yalnız adres sahibine gönderin; email+IP abuse control.

**Regression test:** Var/yok email register cevabı public politika açısından ayırt edilememeli.

**Status:** PARTIALLY FIXED (LOW) — çakışan kayıt için nötr mesaj ve email tabanlı credential throttler eklendi. Başarılı kayıt ile çakışan kaydın durum kodu ayrımı ve email doğrulama akışı ürün kararı olarak kaldı.

## JWT / Session Findings

- VR-SEC-003 ve VR-SEC-007 için kod düzeltmesi ve odaklı regresyon testleri geçti.
- Token decode edilip güvenilen yol yok; rol DB'den okunuyor; global session revocation iyi.
- JWT algoritması, issuer ve audience artık explicit pinli.
- Yedi günlük access token uzun sayılır, fakat DB `sessionVersion` riski azaltıyor.
- Per-device session listesi/seçimli revoke yok.
- SameSite Lax, JSON DTO ve exact production CORS sıradan cross-site POST'u azaltıyor. Origin/Referer/CSRF token kontrolü yok; untrusted sibling subdomain veya cross-site frontend gelirse yeniden ele alınmalı.

## Database Findings

- Tüm raw SQL kullanımları parametreli Prisma tagged template. `$queryRawUnsafe`, `$executeRawUnsafe`, dinamik SQL veya string predicate bulunmadı.
- Customer booking sorguları `guestId`; owner sorguları ilişkili `hostId` içeriyor. Nested nesne-parent eşleşmeleri kontrol ediliyor.
- Fiyat, gece, temizlik, depozito ve kapora backend'de hesaplanıyor; customer DTO fiyat/status/commission kabul etmiyor.
- `withVillaLock`, hold expire + conflict check + write işlemini aynı Villa satır kilidi altında yapıyor. Booking/manual block/iCal işlemleri aynı kilidi kullanıyor.
- Production rehberi uygulama DB rolü ve localhost PostgreSQL öneriyor; canlı yetki/TLS doğrulanmadı.
- PII plaintext operasyonel olarak tutuluyor; kimlik/IBAN/iletişim için retention/deletion ve şifreli backup politikası gerekli.

## Villa Booking Business-Logic Findings

- Client price manipulation yolu bulunmadı.
- Code path içinde double-booking yarışı bulunmadı; request accept/admin create/confirm/change/cancel/manual block/iCal snapshot aynı villa kilidini kullanıyor.
- Tarih aralıkları doğru biçimde `[checkIn, checkOut)`.
- REQUEST stok kapatmıyor; accept sırasında availability ve fiyat yeniden hesaplanıyor.
- Booking status doğrudan DTO ile yazılamıyor; transition servisleri kullanılıyor.
- Yorum, müşterinin kendi CONFIRMED+PAID ve bitmiş konaklamasını gerektiriyor; booking başına unique.
- Kalan ana risk shared throttler store, upload malware taraması ve provider imzası olmayan manuel havale onayı.

## Infrastructure Findings

- Helmet route'lardan önce çalışıyor. Exact production'da `FRONTEND_ORIGIN` yoksa startup fail ediyor.
- nginx 20 MB body sınırı koyuyor; Certbot/TLS deployment adımı. Repo şablonu kendi başına HTTP-only.
- systemd dedicated user, `UMask=0027`, `NoNewPrivileges`, `PrivateTmp` kullanıyor. `ProtectSystem`, `ProtectHome`, `RestrictAddressFamilies`, dar `ReadWritePaths` yok.
- Next.js response CSP/frame/referrer/permissions başlıkları explicit değil. `dangerouslySetInnerHTML` bulunmadı ve React escaping stored XSS'i azaltıyor.
- Docker ve CI security pipeline yok; deploy/migration manuel.

## Dependency Findings

11 Eylül 2026 tarihinde online npm audit sonucu veri akışıyla değerlendirildi:

| Zincir | Audit seviyesi | Reachability kararı |
| --- | --- | --- |
| backend dev `prisma` → `@prisma/config` → `deepmerge-ts <8` (GHSA-ggr8-5vv4-36mx) | High | Prisma CLI/config HTTP'den erişilebilir değil; uygulama saldırgan recursive graph'ını buraya taşımıyor. Runtime exploit doğrulanmadı; build tool güncellenmeli. |
| frontend `next@15.5.25` → bundled `postcss@8.4.31` source-map/stringify advisories | High/Moderate | CSS yalnız güvenilen repo dosyalarından build ediliyor; kullanıcı CSS/source-map yükleyemiyor. Runtime exploit doğrulanmadı; Next/PostCSS güncellenmeli. |

Backend runtime Multer 2.3.0 kullanıyor. Frontend `npm ls`, `@swc/helpers@0.5.15` paketini transitive `>=0.5.17` beklentisine göre invalid raporladı; bu build reproducibility sorunudur, tek başına güvenlik açığı değildir.

**Scanner statüsü:** Mevcut remote runtime yolları için FALSE POSITIVE; bakım güncellemesi önerilir.

## Secrets Findings

- Gerçek `backend/.env` ve `frontend/.env.local` yerelde var fakat Git'te tracked değil; içerikleri rapora alınmadı.
- Tracked ve Git geçmişindeki hassas dosya adlarında yalnız `.env.production.example` şablonları bulundu.
- Common-key taraması dokümantasyon placeholder'ları dışında committed production secret bulmadı.
- Production örnekleri ayrı JWT/iCal anahtarı ve bootstrap sonrası admin credential temizliği öneriyor.
- Runtime secret uzunluğu doğrulanıyor; secret manager/otomatik rotation bulunmuyor.

## Informational Observations

### OBS-001 — Security event logging ve monitoring eksik

Booking/calendar business transition'ları `CalendarAudit` içinde tutuluyor. Başarısız login ve admin kullanıcı değişiklikleri artık PII hash'lenmiş structured security event olarak loglanıyor. Merkezi HTTP correlation ID, immutable sink, upload audit'i, alarm veya anomaly detection hâlâ bulunmadı. Telemetry eklenirken parola, JWT, iCal URL, kimlik belgesi, IBAN ve müşteri iletişimi loglanmamalı.

### OBS-002 — Account recovery ve privileged authentication eksik

Email doğrulama, forgot/reset-password, per-device session ve MFA/WebAuthn yok. Reset eksikliği daha çok erişilebilirlik/destek problemidir; admin MFA eksikliği credential theft etkisini büyütür. One-time hashed reset token, kısa süre, reuse engeli ve session invalidation kullanılmalı.

## Security Improvements Implemented

- Favorites public allowlist ve `PUBLISHED + OPEN` filtreleri.
- Transaction içi villa/başvuru upload kotaları, Multer parça limitleri ve imza doğrulaması.
- Zorunlu 32-byte JWT secret, HS256/issuer/audience pinleme.
- Global throttler, normalize email login kovası ve owner materyal değişikliğinde yeniden inceleme.
- Guest capability sürümleme/iptal, primary admin kilidi ve loopback backend bind.
- Production'da state-changing cookie istekleri `FRONTEND_ORIGIN` origin kontrolünden geçiyor.
- Parolalarda bcrypt'in 72 byte sınırı UTF-8 byte uzunluğuyla doğrulanıyor.

## Regression Tests Added

`test:favorites-security`, `test:upload-quota-security`, `test:jwt-config-security`, `test:rate-limit-security`, `test:owner-moderation-security`, `test:upload-signature-security`, `test:guest-capability-security`, `test:primary-admin-security`, `test:csrf-origin-security` ve `test:password-length-security` geçti. Ayrıca availability, payment, reviews, iCal parser ve iCal SSRF güvenlik testleri geçti. DB-mutating testler kullanıcının yerel veritabanına karşı çalıştırılmadı.

## Remaining Risks

- Canlı firewall, TLS, headers, DB constraint'leri, DB rol yetkileri ve secret entropy uzaktan doğrulanmadı.
- Yerel upload diski uygulamayla kapasite paylaşıyor; kota, izleme ve test edilmiş backup gerekli.
- Manuel ödeme onayı provider-signed callback içermez.
- iCal export URL'si bearer secret'tır; rotation var, cache süresince eski availability geçmişi alıcılarda kalabilir.
- Origin kontrolü yalnızca tanımlı production `FRONTEND_ORIGIN` değerlerine uygulanır; proxy/domain topolojisi değişirse liste güncellenmelidir.

## Recommended Production Hardening

1. Throttler için Redis gibi process dışı shared store ve disk/heap alarmı ekleyin.
2. Upload görsellerini decode/re-encode edin; belge malware taraması ve quarantine ekleyin.
3. Elle SQL'leri takipli migration baseline'ına taşıyıp constraint smoke-check koyun.
4. Admin MFA/WebAuthn, email doğrulama, parola reset ve immutable privileged audit ekleyin.
5. Kayıt endpoint'inde nötr cevap ve email+IP abuse politikası uygulayın.
6. Dependency zincirlerini yükseltip CI'a lockfile audit, SBOM ve secret scanning ekleyin.

## Final Security Score

| Alan | Puan / 10 | Gerekçe |
| --- | ---: | --- |
| Authentication | 7.5 | Parola/session invalidation ve byte sınırı iyi; recovery, verification, MFA yok |
| Authorization | 8.8 | Genel sahiplik, favorites allowlist'i ve primary admin koruması güçlü |
| JWT/session | 8.4 | Secret/alg/iss/aud pinli; recovery ve per-device session yok |
| Database | 8.0 | Parametreli SQL ve kilitler; migration drift |
| Input validation | 8.2 | Global whitelist/DTO, quota ve signature kontrolleri; decode taraması eksik |
| Business logic | 8.8 | Quote/state/concurrency ve owner review akışı güçlü |
| API security | 8.5 | Global/request/account limitleri ve production origin kontrolü; shared store eksik |
| Infrastructure | 8.0 | Loopback bind, Helmet ve frontend security headers; TLS/firewall canlı doğrulaması yok |
| Secrets | 8.0 | JWT ve production iCal secret uzunluğu doğrulanıyor; secret manager/rotation yok |
| Logging/monitoring | 5.5 | Login/admin structured event var; merkezi sink, alarm ve correlation ID yok |
| Dependency security | 7.5 | `@swc/helpers` override ile invalid transitive sürüm giderildi; Next/PostCSS audit yükseltmesi hâlâ major sürüm bekliyor |

**Genel puan: 9.0 / 10.** İlk HIGH bulgu kapatıldı; kalan puan kaybı ağırlıkla MFA/recovery, shared throttler store, upload malware taraması ve migration takibinden kaynaklı.
