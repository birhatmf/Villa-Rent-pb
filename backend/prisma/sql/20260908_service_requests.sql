-- C2: talep modundaki villalar için REQUESTED/DECLINED/WITHDRAWN rezervasyon
-- durumları ve onaylı rezervasyon için değişiklik/iptal talep tablosu. Mevcut
-- "Booking_no_active_overlap" hariç tutma kısıtı zaten yalnızca HOLD/CONFIRMED'i
-- kapsıyor (WHERE status IN ('HOLD','CONFIRMED')) — yeni durumlar stok kilitlemez,
-- o kısıt hiç değişmiyor. Tekrar çalıştırılabilir.
BEGIN;

-- IF NOT EXISTS zaten idempotent; DO/EXCEPTION sarmalamaya gerek yok — PG 12+'de
-- transaction içinde doğrudan çalışır, tek şart aynı transaction içinde yeni
-- değeri KULLANMAMAK (bu migration hiçbir satır yazmıyor, yalnızca tip genişletiyor).
ALTER TYPE "BookingStatus" ADD VALUE IF NOT EXISTS 'REQUESTED' BEFORE 'HOLD';
ALTER TYPE "BookingStatus" ADD VALUE IF NOT EXISTS 'DECLINED';
ALTER TYPE "BookingStatus" ADD VALUE IF NOT EXISTS 'WITHDRAWN';

DO $$ BEGIN
  CREATE TYPE "ServiceRequestType" AS ENUM ('CHANGE', 'CANCELLATION');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ServiceRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "RefundStatus" AS ENUM ('NONE', 'PENDING', 'COMPLETED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "BookingServiceRequest" (
  "id"             TEXT PRIMARY KEY,
  "bookingId"      TEXT NOT NULL REFERENCES "Booking"("id") ON DELETE CASCADE,
  "requestedBy"    TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "type"           "ServiceRequestType" NOT NULL,
  "status"         "ServiceRequestStatus" NOT NULL DEFAULT 'PENDING',
  "payload"        JSONB,
  "customerNote"   TEXT,
  "resolutionNote" TEXT,
  "refundStatus"   "RefundStatus" NOT NULL DEFAULT 'NONE',
  "refundAmount"   INTEGER NOT NULL DEFAULT 0,
  "refundNote"     TEXT,
  "refundUpdatedAt" TIMESTAMPTZ(3),
  "version"        INTEGER NOT NULL DEFAULT 0,
  "createdAt"      TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "resolvedAt"     TIMESTAMPTZ(3),
  "resolvedBy"     TEXT
);

ALTER TABLE "BookingServiceRequest" ADD COLUMN IF NOT EXISTS "refundStatus" "RefundStatus" NOT NULL DEFAULT 'NONE';
ALTER TABLE "BookingServiceRequest" ADD COLUMN IF NOT EXISTS "refundAmount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "BookingServiceRequest" ADD COLUMN IF NOT EXISTS "refundNote" TEXT;
ALTER TABLE "BookingServiceRequest" ADD COLUMN IF NOT EXISTS "refundUpdatedAt" TIMESTAMPTZ(3);

DO $$ BEGIN
  ALTER TABLE "BookingServiceRequest" ADD CONSTRAINT "BookingServiceRequest_refund_amount" CHECK ("refundAmount" >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "BookingServiceRequest_bookingId_type_status_idx"
  ON "BookingServiceRequest" ("bookingId", "type", "status");
CREATE INDEX IF NOT EXISTS "BookingServiceRequest_status_createdAt_idx"
  ON "BookingServiceRequest" ("status", "createdAt");

-- Aynı rezervasyon + tür için tek aktif PENDING talep. Prisma şeması kısmi
-- unique index'i ifade edemediği için burada, raw SQL olarak tutuluyor.
CREATE UNIQUE INDEX IF NOT EXISTS "BookingServiceRequest_one_pending_per_type"
  ON "BookingServiceRequest" ("bookingId", "type")
  WHERE "status" = 'PENDING';

COMMIT;
