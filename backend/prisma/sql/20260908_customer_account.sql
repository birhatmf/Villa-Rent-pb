-- Customer hesap güvenliği: parola değişiminde tüm eski oturumları geçersiz kılan
-- sürüm ve profil değişikliklerini izleyen güncelleme zamanı. Tekrar çalıştırılabilir.
BEGIN;

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "sessionVersion" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

COMMIT;
