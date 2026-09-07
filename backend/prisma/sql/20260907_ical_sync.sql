DO $$ BEGIN
  CREATE TYPE "VillaBookingMode" AS ENUM ('INSTANT', 'REQUEST');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "IcalSourceStatus" AS ENUM ('PENDING', 'ACTIVE', 'PAUSED', 'ERROR', 'REVIEW');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "IcalSyncRunStatus" AS ENUM ('RUNNING', 'SUCCESS', 'NOT_MODIFIED', 'FAILED', 'REVIEW');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TYPE "VillaBlockedDateKind" ADD VALUE IF NOT EXISTS 'ICAL';

BEGIN;

ALTER TABLE "Villa"
  ADD COLUMN IF NOT EXISTS "bookingMode" "VillaBookingMode" NOT NULL DEFAULT 'INSTANT',
  ADD COLUMN IF NOT EXISTS "icalExportTokenHash" TEXT,
  ADD COLUMN IF NOT EXISTS "icalExportTokenCreatedAt" TIMESTAMPTZ(3);

CREATE UNIQUE INDEX IF NOT EXISTS "Villa_icalExportTokenHash_key"
  ON "Villa"("icalExportTokenHash");

CREATE TABLE IF NOT EXISTS "IcalSource" (
  "id" TEXT NOT NULL,
  "villaId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "urlCiphertext" TEXT NOT NULL,
  "urlHash" TEXT NOT NULL,
  "required" BOOLEAN NOT NULL DEFAULT true,
  "status" "IcalSourceStatus" NOT NULL DEFAULT 'PENDING',
  "lastAttemptAt" TIMESTAMPTZ(3),
  "lastSuccessAt" TIMESTAMPTZ(3),
  "coverageStart" DATE,
  "coverageEnd" DATE,
  "etag" TEXT,
  "lastModified" TEXT,
  "nextSyncAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
  "lastErrorCode" TEXT,
  "leaseToken" TEXT,
  "leaseExpiresAt" TIMESTAMPTZ(3),
  "version" INTEGER NOT NULL DEFAULT 0,
  "deletedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IcalSource_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "IcalSource_urlHash_key" ON "IcalSource"("urlHash");
CREATE UNIQUE INDEX IF NOT EXISTS "IcalSource_leaseToken_key" ON "IcalSource"("leaseToken");
CREATE INDEX IF NOT EXISTS "IcalSource_status_nextSyncAt_idx" ON "IcalSource"("status", "nextSyncAt");
CREATE INDEX IF NOT EXISTS "IcalSource_villaId_deletedAt_idx" ON "IcalSource"("villaId", "deletedAt");

DO $$ BEGIN
  ALTER TABLE "IcalSource"
    ADD CONSTRAINT "IcalSource_villaId_fkey"
    FOREIGN KEY ("villaId") REFERENCES "Villa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "IcalSyncRun" (
  "id" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "status" "IcalSyncRunStatus" NOT NULL DEFAULT 'RUNNING',
  "addedCount" INTEGER NOT NULL DEFAULT 0,
  "updatedCount" INTEGER NOT NULL DEFAULT 0,
  "releasedCount" INTEGER NOT NULL DEFAULT 0,
  "conflictCount" INTEGER NOT NULL DEFAULT 0,
  "httpStatus" INTEGER,
  "errorCode" TEXT,
  "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMPTZ(3),
  CONSTRAINT "IcalSyncRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "IcalSyncRun_sourceId_startedAt_idx"
  ON "IcalSyncRun"("sourceId", "startedAt");

DO $$ BEGIN
  ALTER TABLE "IcalSyncRun"
    ADD CONSTRAINT "IcalSyncRun_sourceId_fkey"
    FOREIGN KEY ("sourceId") REFERENCES "IcalSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "VillaBlockedDate"
  ADD COLUMN IF NOT EXISTS "sourceId" TEXT,
  ADD COLUMN IF NOT EXISTS "externalUid" TEXT,
  ADD COLUMN IF NOT EXISTS "externalRecurrence" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "externalFingerprint" TEXT,
  ADD COLUMN IF NOT EXISTS "missingCount" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "VillaBlockedDate_sourceId_state_startDate_idx"
  ON "VillaBlockedDate"("sourceId", "state", "startDate");
CREATE UNIQUE INDEX IF NOT EXISTS "VillaBlockedDate_ical_identity_key"
  ON "VillaBlockedDate"("sourceId", "externalUid", "externalRecurrence")
  WHERE "sourceId" IS NOT NULL;

DO $$ BEGIN
  ALTER TABLE "VillaBlockedDate"
    ADD CONSTRAINT "VillaBlockedDate_sourceId_fkey"
    FOREIGN KEY ("sourceId") REFERENCES "IcalSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "VillaBlockedDate"
    ADD CONSTRAINT "VillaBlockedDate_ical_source_check"
    CHECK (
      ("kind"::text = 'ICAL' AND "sourceId" IS NOT NULL AND "externalUid" IS NOT NULL)
      OR
      ("kind"::text <> 'ICAL' AND "sourceId" IS NULL AND "externalUid" IS NULL)
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMIT;
