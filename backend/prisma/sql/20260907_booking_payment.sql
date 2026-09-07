-- Aşama 5 (POS'suz): rezervasyon kaporası ve havale bildirimi.
-- Tekrar çalıştırılabilir. Mevcut rezervasyonlar 'NONE' kalır — ödeme akışından
-- önce açıldıkları için geriye dönük kapora borcu yaratılmaz.
BEGIN;

DO $$
BEGIN
  CREATE TYPE "BookingPaymentStatus" AS ENUM ('NONE', 'PENDING', 'DECLARED', 'PAID');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

ALTER TABLE "Booking"
  ADD COLUMN IF NOT EXISTS "paymentStatus" "BookingPaymentStatus" NOT NULL DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS "prepaymentAmount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "paymentDeclaredAt" TIMESTAMPTZ(3);

ALTER TABLE "Booking"
  DROP CONSTRAINT IF EXISTS "Booking_prepayment_range";
ALTER TABLE "Booking"
  ADD CONSTRAINT "Booking_prepayment_range"
  CHECK ("prepaymentAmount" >= 0 AND "prepaymentAmount" <= "totalAmount");

CREATE INDEX IF NOT EXISTS "Booking_paymentStatus_createdAt_idx"
  ON "Booking" ("paymentStatus", "createdAt");

COMMIT;
