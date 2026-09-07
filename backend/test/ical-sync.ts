import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { IcalService } from '../src/ical/ical.service';
import { parseIcal, type IcalSnapshot } from '../src/ical/ical-parser';
import { OccupancyService } from '../src/bookings/occupancy.service';
import { PrismaService } from '../src/prisma.service';

if (process.env.ALLOW_ICAL_TEST !== '1') {
  throw new Error('Bu test yalnızca geçici veritabanında ALLOW_ICAL_TEST=1 ile çalıştırılabilir.');
}

const prisma = new PrismaService();
const occupancy = new OccupancyService(prisma);
const ical = new IcalService(prisma, occupancy);
const marker = `ical-test-${Date.now()}`;
const startedAt = new Date();
let sourceId: string | undefined;
let bookingId: string | undefined;
let villaId: string | undefined;
let originalMode: 'INSTANT' | 'REQUEST' = 'INSTANT';
let originalTokenHash: string | null = null;
let originalTokenCreatedAt: Date | null = null;

async function main() {
  await prisma.$connect();
  const villa = await prisma.villa.findFirst({
    where: { status: 'PUBLISHED' },
    select: { id: true, bookingMode: true, icalExportTokenHash: true, icalExportTokenCreatedAt: true },
  });
  const actor = await prisma.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true } });
  assert.ok(villa && actor, 'Seed edilmiş villa ve admin bulunmalı.');
  villaId = villa.id;
  originalMode = villa.bookingMode;
  originalTokenHash = villa.icalExportTokenHash;
  originalTokenCreatedAt = villa.icalExportTokenCreatedAt;

  const source = await prisma.icalSource.create({
    data: {
      villaId,
      label: marker,
      urlCiphertext: 'test-only',
      urlHash: marker,
      status: 'PENDING',
    },
  });
  sourceId = source.id;
  await prisma.villa.update({ where: { id: villaId }, data: { bookingMode: 'REQUEST' } });
  const booking = await prisma.booking.create({
    data: {
      villaId,
      status: 'CONFIRMED',
      channel: 'ADMIN',
      checkIn: new Date('2037-05-11T00:00:00.000Z'),
      checkOut: new Date('2037-05-13T00:00:00.000Z'),
      adults: 2,
      currency: 'TRY',
      accommodationAmount: 1,
      cleaningFeeAmount: 0,
      depositAmount: 0,
      totalAmount: 1,
      priceSnapshot: {},
      confirmedAt: new Date(),
      customerName: 'Export edilmemeli',
      customerEmail: 'secret@example.test',
      idempotencyOwner: marker,
      idempotencyKey: marker,
      requestHash: marker,
    },
  });
  bookingId = booking.id;

  const first = snapshot([
    event('moving', '20370510', '20370514'),
    event('anchor', '20370601', '20370603'),
  ]);
  const initial = await apply(first);
  assert.equal(initial.addedCount, 2);
  assert.equal(initial.conflictCount, 1, 'Dış kayıt rezervasyonla çakışsa da saklanmalı.');

  const moved = await apply(snapshot([
    event('moving', '20370515', '20370518'),
    event('anchor', '20370601', '20370603'),
  ]));
  assert.equal(moved.updatedCount, 1);
  assert.equal(await prisma.villaBlockedDate.count({ where: { sourceId, externalUid: 'moving' } }), 1);

  const firstMissing = await apply(snapshot([event('anchor', '20370601', '20370603')]));
  assert.equal(firstMissing.releasedCount, 0);
  assert.equal((await prisma.villaBlockedDate.findFirstOrThrow({ where: { sourceId, externalUid: 'moving' } })).missingCount, 1);

  const secondMissing = await apply(snapshot([event('anchor', '20370601', '20370603')]));
  assert.equal(secondMissing.releasedCount, 1, 'Kaybolan olay iki başarılı görüntüden sonra bırakılmalı.');

  const cancelled = await apply(snapshot([event('anchor', '20370601', '20370603', ['STATUS:CANCELLED'])]));
  assert.equal(cancelled.releasedCount, 1, 'Açık iptal bilgisi blokajı hemen bırakmalı.');

  const { token } = await ical.rotateExportToken(villaId, actor.id);
  const exported = await ical.exportCalendar(token);
  assert.match(exported.body, /UID:booking-/);
  assert.doesNotMatch(exported.body, /Export edilmemeli|secret@example\.test|moving|anchor/);

  const stale = await takeLease();
  await prisma.icalSource.update({ where: { id: sourceId }, data: { leaseToken: randomUUID(), version: { increment: 1 } } });
  const run = await prisma.icalSyncRun.create({ data: { sourceId } });
  await assert.rejects(
    (ical as any).applySnapshot(stale, run.id, first, { httpStatus: 200 }),
    (error: unknown) => error instanceof Error && error.message === 'ICAL_STALE_WORKER',
  );

  console.log('ical-sync: kimlik güncelleme, iki görüntülü silme, açık iptal, çakışma, eski işçi ve güvenli export geçti');
}

async function apply(data: IcalSnapshot) {
  const lease = await takeLease();
  const run = await prisma.icalSyncRun.create({ data: { sourceId: sourceId! } });
  return (ical as any).applySnapshot(lease, run.id, data, { httpStatus: 200, etag: marker });
}

async function takeLease() {
  const leaseToken = randomUUID();
  return prisma.icalSource.update({
    where: { id: sourceId! },
    data: { leaseToken, leaseExpiresAt: new Date(Date.now() + 60_000), version: { increment: 1 } },
    select: {
      id: true,
      villaId: true,
      label: true,
      urlCiphertext: true,
      etag: true,
      lastModified: true,
      version: true,
      leaseToken: true,
    },
  });
}

function snapshot(events: string[]) {
  return parseIcal(`BEGIN:VCALENDAR\r
VERSION:2.0\r
PRODID:-//My Villa Test//TR\r
${events.join('\r\n')}\r
END:VCALENDAR\r
`, '2037-01-01', '2038-01-01');
}

function event(uid: string, start: string, end: string, extra: string[] = []) {
  return ['BEGIN:VEVENT', `UID:${uid}`, `DTSTART;VALUE=DATE:${start}`, `DTEND;VALUE=DATE:${end}`, ...extra, 'END:VEVENT'].join('\r\n');
}

main()
  .finally(async () => {
    if (villaId) await prisma.calendarAudit.deleteMany({ where: { villaId, createdAt: { gte: startedAt } } });
    if (bookingId) await prisma.booking.deleteMany({ where: { id: bookingId } });
    if (sourceId) {
      await prisma.villaBlockedDate.deleteMany({ where: { sourceId } });
      await prisma.icalSyncRun.deleteMany({ where: { sourceId } });
      await prisma.icalSource.deleteMany({ where: { id: sourceId } });
    }
    if (villaId) {
      await prisma.villa.update({
        where: { id: villaId },
        data: {
          bookingMode: originalMode,
          icalExportTokenHash: originalTokenHash,
          icalExportTokenCreatedAt: originalTokenCreatedAt,
        },
      });
    }
    await prisma.$disconnect();
  });
