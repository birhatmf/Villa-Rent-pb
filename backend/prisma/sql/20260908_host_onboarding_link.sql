-- Onaylı ev sahibi başvurusunu gerçek bir HOST hesabına bağlar. Başvuru kalıcı
-- kaynak kayıt olarak kalır; tek yeni alan hangi kullanıcıya bağlandığı.
-- Tekrar çalıştırılabilir.
BEGIN;

ALTER TABLE "HostApplication" ADD COLUMN IF NOT EXISTS "linkedHostId" TEXT;

ALTER TABLE "HostApplication" DROP CONSTRAINT IF EXISTS "HostApplication_linkedHostId_fkey";
ALTER TABLE "HostApplication"
  ADD CONSTRAINT "HostApplication_linkedHostId_fkey"
  FOREIGN KEY ("linkedHostId") REFERENCES "User"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "HostApplication_linkedHostId_idx" ON "HostApplication" ("linkedHostId");

COMMIT;
