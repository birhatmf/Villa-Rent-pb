-- Her ev sahibi başvurusu kayıtlı kullanıcıya bağlı açılır. Aynı kullanıcı için
-- yalnızca bir bekleyen veya onaylanmış başvuru bulunabilir. Reddedilen başvuru
-- geçmişte kalır ve kullanıcı yeniden başvurabilir. Tekrar çalıştırılabilir.
BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS "HostApplication_one_active_per_user"
  ON "HostApplication" ("linkedHostId")
  WHERE "linkedHostId" IS NOT NULL AND "status" IN ('PENDING', 'APPROVED');

COMMIT;
