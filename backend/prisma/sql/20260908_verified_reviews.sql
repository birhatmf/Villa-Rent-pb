-- C4: doğrulanmış konaklama yorumu, tek owner yanıtı ve public puan özeti.
-- Tekrar çalıştırılabilir; eski demo puanları gerçek yorum olmadığı için sıfırlanır.
BEGIN;

DO $$ BEGIN
  CREATE TYPE "ReviewStatus" AS ENUM ('PUBLISHED', 'HIDDEN');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "Review" (
  "id"               TEXT PRIMARY KEY,
  "bookingId"        TEXT NOT NULL UNIQUE REFERENCES "Booking"("id") ON DELETE RESTRICT,
  "villaId"          TEXT NOT NULL REFERENCES "Villa"("id") ON DELETE RESTRICT,
  "guestId"          TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "rating"           INTEGER NOT NULL,
  "body"             TEXT NOT NULL,
  "status"           "ReviewStatus" NOT NULL DEFAULT 'PUBLISHED',
  "moderationReason" TEXT,
  "moderatedAt"      TIMESTAMPTZ(3),
  "moderatedBy"      TEXT REFERENCES "User"("id") ON DELETE SET NULL,
  "createdAt"        TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "updatedAt"        TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  CONSTRAINT "Review_rating_range" CHECK ("rating" BETWEEN 1 AND 5),
  CONSTRAINT "Review_body_length" CHECK (char_length("body") BETWEEN 10 AND 2000)
);

CREATE TABLE IF NOT EXISTS "ReviewResponse" (
  "id"          TEXT PRIMARY KEY,
  "reviewId"    TEXT NOT NULL UNIQUE REFERENCES "Review"("id") ON DELETE CASCADE,
  "responderId" TEXT REFERENCES "User"("id") ON DELETE SET NULL,
  "body"        TEXT NOT NULL,
  "createdAt"   TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "updatedAt"   TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  CONSTRAINT "ReviewResponse_body_length" CHECK (char_length("body") BETWEEN 2 AND 1000)
);

CREATE INDEX IF NOT EXISTS "Review_villaId_status_createdAt_idx"
  ON "Review" ("villaId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "Review_guestId_createdAt_idx"
  ON "Review" ("guestId", "createdAt");

UPDATE "Villa" v
SET "rating" = COALESCE(s.average, 0),
    "reviewCount" = COALESCE(s.total, 0)
FROM (
  SELECT v2."id", AVG(r."rating")::double precision AS average, COUNT(r."id")::integer AS total
  FROM "Villa" v2
  LEFT JOIN "Review" r ON r."villaId" = v2."id" AND r."status" = 'PUBLISHED'
  GROUP BY v2."id"
) s
WHERE v."id" = s."id";

COMMIT;
