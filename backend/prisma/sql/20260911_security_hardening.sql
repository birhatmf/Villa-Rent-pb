-- Üyesiz rezervasyon erişim anahtarlarını terminal durumlarda iptal edebilmek için.
-- Tekrar çalıştırılabilir; mevcut kayıtlar sürüm 0 ile devam eder.
BEGIN;

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "isPrimaryAdmin" BOOLEAN NOT NULL DEFAULT FALSE;

-- Eski kurulumlarda ilk oluşturulan admini koruyucu olarak işaretle.
UPDATE "User"
SET "isPrimaryAdmin" = TRUE
WHERE id = (
  SELECT id FROM "User"
  WHERE role = 'ADMIN'
  ORDER BY "createdAt" ASC, id ASC
  LIMIT 1
)
AND NOT EXISTS (SELECT 1 FROM "User" WHERE "isPrimaryAdmin" = TRUE);

CREATE INDEX IF NOT EXISTS "User_isPrimaryAdmin_idx" ON "User"("isPrimaryAdmin");

ALTER TABLE "Booking"
  ADD COLUMN IF NOT EXISTS "guestAccessVersion" INTEGER NOT NULL DEFAULT 0;

COMMIT;
