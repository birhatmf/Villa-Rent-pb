# Production kurulum rehberi

Bu rehber tek bir Ubuntu VPS üzerinde şu yapıyı kurar:

- Nginx: `80/443`, alan adı ve HTTPS
- Next.js frontend: yalnızca `127.0.0.1:3000`
- NestJS backend: yalnızca `127.0.0.1:4000`
- PostgreSQL: yalnızca yerel bağlantı
- systemd: frontend ve backend süreç yönetimi
- kalıcı dosyalar: `/srv/my-villa/backend/uploads`

Örnek alan adı `example.com`, Linux kullanıcısı `myvilla`, uygulama dizini
`/srv/my-villa` olarak verilmiştir. Komutları çalıştırmadan önce alan adını değiştirin.

## 0. Yayına alınacak kodu hazırlayın

Sunucu yalnızca GitHub'a gönderilmiş kodu alır. Yerel bilgisayarda önce çalışma
ağacını kontrol edin, gerekli değişiklikleri commit edip gönderin:

```sh
cd /Users/birhatmf/Desktop/my_villa
git status
git add <yayına-alınacak-dosyalar>
git commit -m "Prepare production deployment"
git push origin main
```

`.env` dosyalarını, veritabanı dump'ını ve `backend/uploads` içeriğini Git'e
eklemeyin. Bunlar sunucuya ayrı ve güvenli biçimde taşınır.

Alan adının `A` kaydını sunucunun IPv4 adresine, kullanılıyorsa `www` kaydını da
aynı sunucuya yönlendirin. HTTPS adımı için DNS'in yayılmış olması gerekir.

## 1. Sunucuyu hazırlayın

Ubuntu 22.04 veya 24.04 üzerinde sudo yetkili kullanıcıyla:

```sh
sudo apt update
sudo apt upgrade -y
sudo apt install -y git curl ca-certificates nginx postgresql postgresql-contrib openssl
```

Node.js 24 LTS'yi sistem genelinde kurun. Aşağıdaki yöntem systemd şablonlarının
beklediği `/usr/bin/node` ve `/usr/bin/npm` yollarını sağlar:

```sh
curl -fsSL https://deb.nodesource.com/setup_24.x -o /tmp/nodesource_setup.sh
sudo -E bash /tmp/nodesource_setup.sh
sudo apt install -y nodejs
node --version
npm --version
command -v node
command -v npm
```

Son iki komut `/usr/bin/node` ve `/usr/bin/npm` göstermiyorsa
`deploy/systemd/*.service` dosyalarındaki `ExecStart` yolunu sunucudaki gerçek
`npm` yoluna göre değiştirin.

Uygulamayı parolasız, etkileşimli oturumu olmayan ayrı bir kullanıcıyla çalıştırın:

```sh
sudo useradd --system --create-home --shell /usr/sbin/nologin myvilla
sudo mkdir -p /srv/my-villa
sudo chown myvilla:myvilla /srv/my-villa
sudo -u myvilla git clone https://github.com/birhatmf/villa-realestate-rent.git /srv/my-villa
```

Özel repo kullanılıyorsa sunucuda deploy key tanımlayıp SSH clone adresini kullanın.

İsteğe bağlı temel firewall:

```sh
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

`3000`, `4000` ve `5432` portlarını internete açmayın.

## 2. PostgreSQL veritabanını oluşturun

Önce URL içinde kaçış gerektirmeyen güçlü bir parola üretin:

```sh
openssl rand -hex 24
```

Çıktıyı güvenli bir parola yöneticisine kaydedin. Ardından rol ve veritabanını
oluşturun; `createuser` parolayı iki kez sorar:

```sh
sudo -u postgres createuser --pwprompt myvilla_app
sudo -u postgres createdb --owner=myvilla_app --encoding=UTF8 my_villa
sudo -u postgres psql -d my_villa -c 'CREATE EXTENSION IF NOT EXISTS btree_gist;'
```

Kontrol edin:

```sh
sudo -u postgres psql -d my_villa -c '\dx btree_gist'
sudo -u postgres psql -d my_villa -c '\l+ my_villa'
```

`btree_gist`, aynı villada çakışan aktif rezervasyonları ve sezon fiyatlarını
veritabanı düzeyinde engelleyen exclusion constraint'ler için zorunludur.

## 3. Production ortam dosyalarını oluşturun

Backend örneğini kopyalayın:

```sh
sudo -u myvilla cp /srv/my-villa/backend/.env.production.example /srv/my-villa/backend/.env
sudo chmod 600 /srv/my-villa/backend/.env
sudo nano /srv/my-villa/backend/.env
```

Dosyada en az şu değerleri gerçek değerlerle doldurun:

```dotenv
NODE_ENV=production
PORT=4000
DATABASE_URL=postgresql://myvilla_app:VERITABANI_PAROLASI@127.0.0.1:5432/my_villa?schema=public
JWT_SECRET=UZUN_RASTGELE_DEGER
ICAL_ENCRYPTION_KEY=AYRI_UZUN_RASTGELE_DEGER
FRONTEND_ORIGIN=https://example.com,https://www.example.com
PUBLIC_URL=https://example.com
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=EN_AZ_12_KARAKTER_GUCLU_PAROLA
ADMIN_NAME=Yönetici
```

JWT ve iCal anahtarlarını ayrı üretin:

```sh
openssl rand -hex 64
openssl rand -hex 32
```

Kurallar:

- `DATABASE_URL` içindeki parola hex olarak üretildiyse ayrıca URL encode gerekmez.
- `FRONTEND_ORIGIN` değerlerini boşluksuz virgülle ayırın.
- `PUBLIC_URL` ve frontend alan adı aynı HTTPS adresini kullanmalıdır; sona `/` koymayın.
- `JWT_SECRET` değişirse bütün oturumlar geçersiz olur.
- `ICAL_ENCRYPTION_KEY` kaybolursa kayıtlı dış takvim URL'leri çözülemez. Bu anahtarı
  veritabanı yedeğiyle birlikte güvenli biçimde yedekleyin.

Frontend ortamını oluşturun:

```sh
sudo -u myvilla cp /srv/my-villa/frontend/.env.production.example /srv/my-villa/frontend/.env.production
sudo chmod 600 /srv/my-villa/frontend/.env.production
sudo nano /srv/my-villa/frontend/.env.production
```

```dotenv
NEXT_PUBLIC_API_URL=https://example.com/api
API_URL=http://127.0.0.1:4000/api
NEXT_PUBLIC_SITE_URL=https://example.com
```

`NEXT_PUBLIC_*` değişkenleri frontend build'ine gömülür. Bu dosyayı mutlaka
`npm run build` komutundan önce hazırlayın; değiştirdikten sonra yeniden build alın.

## 4. Bağımlılıkları kurun ve backend'i derleyin

```sh
cd /srv/my-villa/backend
sudo -u myvilla npm ci
sudo -u myvilla npx prisma validate
sudo -u myvilla npx prisma generate
sudo -u myvilla npm run build
```

`npm ci`, lock dosyasındaki kesin sürümleri kurar. Production sunucusunda
`npm install` ile lock dosyasını değiştirmeyin.

## 5. Boş veritabanını kurun ve migration'ları uygulayın

Bu projede henüz Prisma Migrate geçmişi yoktur. Bu nedenle `prisma migrate deploy`
hiçbir şey yapmaz. İlk ve tamamen boş production veritabanında önce Prisma şemasını
oluşturun:

```sh
cd /srv/my-villa/backend
sudo -u myvilla npx prisma db push
```

Ardından özel PostgreSQL constraint, index ve veri geçişlerini bu sırayla uygulayın:

```sh
sudo -u myvilla npx prisma db execute --file prisma/sql/20260906_availability_foundation.sql --schema prisma/schema.prisma
sudo -u myvilla npx prisma db execute --file prisma/sql/20260906_booking_core.sql --schema prisma/schema.prisma
sudo -u myvilla npx prisma db execute --file prisma/sql/20260906_calendar_management.sql --schema prisma/schema.prisma
sudo -u myvilla npx prisma db execute --file prisma/sql/20260907_ical_sync.sql --schema prisma/schema.prisma
sudo -u myvilla npx prisma db execute --file prisma/sql/20260907_booking_payment.sql --schema prisma/schema.prisma
sudo -u myvilla npx prisma db execute --file prisma/sql/20260908_customer_account.sql --schema prisma/schema.prisma
sudo -u myvilla npx prisma db execute --file prisma/sql/20260908_host_onboarding_link.sql --schema prisma/schema.prisma
sudo -u myvilla npx prisma db execute --file prisma/sql/20260908_authenticated_host_applications.sql --schema prisma/schema.prisma
sudo -u myvilla npx prisma db execute --file prisma/sql/20260908_service_requests.sql --schema prisma/schema.prisma
sudo -u myvilla npx prisma db execute --file prisma/sql/20260908_verified_reviews.sql --schema prisma/schema.prisma
sudo -u myvilla npx prisma db execute --file prisma/sql/20260908_info_pages.sql --schema prisma/schema.prisma
```

Bu sıra önemlidir. SQL dosyaları tekrar çalıştırılabilir olarak yazılmıştır; yine de
canlı veritabanında her şema değişikliğinden önce yedek alın.

Production'da `npm run db:seed` çalıştırmayın. Mevcut seed rezervasyonları,
villaları, bölgeleri ve sayfaları silip demo veri oluşturur.

Canlı veriyi silmeyen ilk admin hesabını oluşturun:

```sh
cd /srv/my-villa/backend
sudo -u myvilla npm run db:create-admin
```

Komut aynı admin zaten varsa hiçbir şeyi değiştirmez; e-posta başka role aitse rolü
değiştirmeden hata verir. Admin oluşturulduktan sonra `.env` içindeki
`ADMIN_EMAIL`, `ADMIN_PASSWORD` ve `ADMIN_NAME` satırlarını silin.

Boş veritabanında demo ana sayfa/villa içeriği bulunmaz. İçeriği admin panelinden
oluşturun. Demo verisi gerçekten isteniyorsa `db:seed` yalnızca veri girişi
başlamadan önce, veritabanının boş olduğu doğrulanarak bir kez çalıştırılabilir;
oluşturduğu örnek villa ve metinler yayından önce değiştirilmelidir.

## 6. Mevcut yerel veriyi sunucuya taşımak isterseniz

Bu bölüm, 5. bölümdeki boş veritabanı kurulumunun alternatifidir. Yerel bilgisayarda:

```sh
pg_dump -h 127.0.0.1 -U YEREL_DB_KULLANICISI -d my_villa \
  --format=custom --no-owner --no-acl --file=my_villa.dump
tar -C /Users/birhatmf/Desktop/my_villa/backend -czf my_villa_uploads.tar.gz uploads
scp my_villa.dump my_villa_uploads.tar.gz SUNUCU_KULLANICISI@SUNUCU_IP:/tmp/
```

Sunucuda oluşturduğunuz boş `my_villa` veritabanına geri yükleyin:

```sh
sudo -u postgres pg_restore --clean --if-exists --no-owner \
  --role=myvilla_app --dbname=my_villa /tmp/my_villa.dump
sudo -u postgres psql -d my_villa -c 'CREATE EXTENSION IF NOT EXISTS btree_gist;'
```

Sonra 5. bölümdeki SQL dosyalarının tamamını sırayla uygulayın. Dosyalar idempotent
olduğu için yerelde uygulanmış olanlar veri kaybetmeden atlanır/tamamlanır. Restore
edilmiş veritabanında `prisma db push` çalıştırmayın.

Yerelde yüklenmiş görsellerin veritabanında `localhost` adresi varsa yalnızca
`storedName` alanı bulunan yerel upload kayıtlarını canlı alan adına taşıyın.
Komuttaki alan adını önce değiştirin:

```sh
sudo -u postgres psql -d my_villa -c \
  "UPDATE \"VillaImage\" SET \"url\" = regexp_replace(\"url\", '^https?://[^/]+/uploads/', 'https://example.com/uploads/') WHERE \"storedName\" IS NOT NULL;"
```

Upload'ları açın ve izinleri düzeltin:

```sh
sudo tar -C /srv/my-villa/backend -xzf /tmp/my_villa_uploads.tar.gz
sudo chown -R myvilla:myvilla /srv/my-villa/backend/uploads
sudo find /srv/my-villa/backend/uploads -type d -exec chmod 750 {} \;
sudo find /srv/my-villa/backend/uploads -type f -exec chmod 640 {} \;
sudo rm /tmp/my_villa.dump /tmp/my_villa_uploads.tar.gz
```

Veritabanı ve `uploads` aynı ana ait olmalıdır; başvuru belgelerinin kayıtları
veritabanında, dosyaları disktedir.

## 7. Frontend'i derleyin

```sh
cd /srv/my-villa/frontend
sudo -u myvilla npm ci
sudo -u myvilla npm run build
```

Yükleme dizinini her iki kurulum yolunda da oluşturup sahipliği düzeltin:

```sh
sudo mkdir -p /srv/my-villa/backend/uploads/villas
sudo mkdir -p /srv/my-villa/backend/uploads/media
sudo mkdir -p /srv/my-villa/backend/uploads/host-applications
sudo chown -R myvilla:myvilla /srv/my-villa/backend/uploads
sudo chmod 750 /srv/my-villa/backend/uploads
```

## 8. systemd servislerini kurun

Repo içindeki hazır servisleri kopyalayın:

```sh
sudo cp /srv/my-villa/deploy/systemd/my-villa-backend.service /etc/systemd/system/
sudo cp /srv/my-villa/deploy/systemd/my-villa-frontend.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now my-villa-backend
sudo systemctl enable --now my-villa-frontend
```

Durumu ve logları kontrol edin:

```sh
sudo systemctl status my-villa-backend --no-pager
sudo systemctl status my-villa-frontend --no-pager
sudo journalctl -u my-villa-backend -n 100 --no-pager
sudo journalctl -u my-villa-frontend -n 100 --no-pager
curl -i http://127.0.0.1:4000/api/regions
curl -I http://127.0.0.1:3000
```

Backend `WorkingDirectory` değeri değiştirilmemelidir; villa görselleri ve gizli
başvuru belgeleri bu dizine göre `backend/uploads` altında bulunur. iCal işçisi de
backend süreci içinde başlar ve yaklaşık 15 dakikada bir senkronizasyon yapar.

## 9. Nginx ve HTTPS'i açın

Önce şablondaki iki `example.com` değerini gerçek alan adınızla değiştirin:

```sh
sudo cp /srv/my-villa/deploy/nginx/my-villa.conf /etc/nginx/sites-available/my-villa
sudo nano /etc/nginx/sites-available/my-villa
sudo ln -sf /etc/nginx/sites-available/my-villa /etc/nginx/sites-enabled/my-villa
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

HTTP erişimini test edin:

```sh
curl -I http://example.com
curl -i http://example.com/api/regions
```

Certbot'u kurup Nginx yapılandırmasına sertifikayı ekletin:

```sh
sudo snap install core
sudo snap refresh core
sudo snap install --classic certbot
sudo ln -sf /snap/bin/certbot /usr/local/bin/certbot
sudo certbot --nginx -d example.com -d www.example.com
sudo certbot renew --dry-run
```

Production çerezleri `Secure` olduğu için müşteri, owner ve admin oturumlarını
yalnızca HTTPS açıldıktan sonra test edin.

## 10. Yayın kabul kontrolü

```sh
curl -I https://example.com
curl -i https://example.com/api/regions
sudo systemctl is-active my-villa-backend my-villa-frontend nginx postgresql
sudo journalctl -u my-villa-backend --since '10 minutes ago' --no-pager
sudo journalctl -u my-villa-frontend --since '10 minutes ago' --no-pager
```

Tarayıcıdan şu akışları kontrol edin:

1. `/admin/login` ile admin girişi.
2. Villa görseli yükleme ve public sayfada görüntülenmesi.
3. Üyeli ve üyesiz rezervasyon oluşturma.
4. Owner başvurusu, admin onayı ve yeni HOST oturumu.
5. Admin rezervasyon onayı ve müşteri rezervasyon detayı.
6. Varsa bir test iCal kaynağının önizleme ve senkronizasyonu.

## 11. Sonraki sürümleri yayınlama

Önce veritabanı ve upload yedeği alın. Sonra:

```sh
cd /srv/my-villa
sudo -u myvilla git pull --ff-only origin main

cd /srv/my-villa/backend
sudo -u myvilla npm ci
sudo -u myvilla npx prisma validate
sudo -u myvilla npx prisma generate
sudo -u myvilla npm run build
```

Yeni bir `backend/prisma/sql/*.sql` dosyası geldiyse yalnızca yedekten sonra ve
dosya sırasına göre uygulayın. Mevcut canlı veritabanında rutin deploy sırasında
`prisma db push` veya `db:seed` çalıştırmayın.

```sh
cd /srv/my-villa/frontend
sudo -u myvilla npm ci
sudo -u myvilla npm run build

sudo systemctl restart my-villa-backend
sudo systemctl restart my-villa-frontend
sudo systemctl status my-villa-backend my-villa-frontend --no-pager
```

## 12. Yedekleme ve geri yükleme

Yedek dizinini oluşturun:

```sh
sudo install -d -m 700 -o postgres -g postgres /var/backups/my-villa
```

Manuel veritabanı yedeği:

```sh
sudo -u postgres pg_dump --format=custom --file=/var/backups/my-villa/my_villa.dump my_villa
```

Upload yedeği:

```sh
sudo tar -C /srv/my-villa/backend -czf /var/backups/my-villa/uploads.tar.gz uploads
sudo chmod 600 /var/backups/my-villa/uploads.tar.gz
```

Bu dosyaları aynı sunucuda bırakmak yeterli değildir. Şifreli biçimde ayrı bir
sunucuya veya object storage'a kopyalayın. Saklanması gereken üç parça birlikte:

- PostgreSQL dump
- `backend/uploads`
- `JWT_SECRET` ve özellikle `ICAL_ENCRYPTION_KEY` içeren güvenli secret yedeği

Geri yükleme canlı veriyi değiştirir; bakım penceresinde servisleri durdurup yapılır:

```sh
sudo systemctl stop my-villa-frontend my-villa-backend
sudo -u postgres pg_restore --clean --if-exists --no-owner \
  --role=myvilla_app --dbname=my_villa /var/backups/my-villa/my_villa.dump
sudo tar -C /srv/my-villa/backend -xzf /var/backups/my-villa/uploads.tar.gz
sudo chown -R myvilla:myvilla /srv/my-villa/backend/uploads
sudo systemctl start my-villa-backend my-villa-frontend
```

Yedeği düzenli almak kadar test sunucusunda geri yükleyebildiğinizi doğrulamak da
gereklidir.

## Sık görülen hatalar

### `P1001` veya veritabanına bağlanamıyor

`DATABASE_URL`, PostgreSQL servisi ve rol parolasını kontrol edin:

```sh
sudo systemctl status postgresql --no-pager
sudo -u myvilla bash -lc 'cd /srv/my-villa/backend && npx prisma db execute --stdin --schema prisma/schema.prisma' <<< 'SELECT 1;'
```

### `permission denied` ile upload başarısız

```sh
sudo chown -R myvilla:myvilla /srv/my-villa/backend/uploads
sudo find /srv/my-villa/backend/uploads -type d -exec chmod 750 {} \;
sudo find /srv/my-villa/backend/uploads -type f -exec chmod 640 {} \;
```

### Görseller canlıda açılmıyor

Backend `.env` içindeki `PUBLIC_URL` ile frontend `.env.production` içindeki
`NEXT_PUBLIC_SITE_URL` aynı HTTPS alan adı olmalı. Değişiklikten sonra frontend'i
yeniden build edip iki servisi yeniden başlatın.

### Login oluyor ama oturum korunmuyor

HTTPS'in açık olduğunu, `NODE_ENV=production`, `FRONTEND_ORIGIN` ve tarayıcının
kullandığı alan adının birebir eşleştiğini kontrol edin. `www` ve çıplak alan adı
farklı origin'dir.

### Migration `btree_gist` yetkisiyle duruyor

Eklentiyi PostgreSQL yöneticisi olarak açıp migration'ı yeniden çalıştırın:

```sh
sudo -u postgres psql -d my_villa -c 'CREATE EXTENSION IF NOT EXISTS btree_gist;'
```
