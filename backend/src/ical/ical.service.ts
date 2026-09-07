import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma.service';
import { OccupancyService } from '../bookings/occupancy.service';
import { formatCalendarDate } from '../villas/availability';
import { downloadIcal, IcalFetchError, normalizeIcalUrl } from './ical-fetch';
import { IcalSnapshot, parseIcal } from './ical-parser';

const HEALTHY_FOR_MS = 60 * 60_000;
const SYNC_INTERVAL_MS = 15 * 60_000;
const LEASE_MS = 2 * 60_000;
const SOURCE_SELECT = {
  id: true,
  villaId: true,
  label: true,
  required: true,
  status: true,
  lastAttemptAt: true,
  lastSuccessAt: true,
  coverageStart: true,
  coverageEnd: true,
  nextSyncAt: true,
  consecutiveFailures: true,
  lastErrorCode: true,
  version: true,
  createdAt: true,
  runs: {
    orderBy: { startedAt: 'desc' as const },
    take: 5,
    select: {
      id: true,
      status: true,
      addedCount: true,
      updatedCount: true,
      releasedCount: true,
      conflictCount: true,
      errorCode: true,
      startedAt: true,
      finishedAt: true,
    },
  },
} as const;

type Lease = {
  id: string;
  villaId: string;
  label: string;
  urlCiphertext: string;
  etag: string | null;
  lastModified: string | null;
  version: number;
  leaseToken: string;
};

class IcalReviewError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

@Injectable()
export class IcalService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;

  constructor(
    private prisma: PrismaService,
    private occupancy: OccupancyService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.syncDue(), 60_000);
    this.timer.unref();
    setTimeout(() => void this.syncDue(), 5_000).unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async list(villaId: string, hostId?: string) {
    await this.assertScope(villaId, hostId);
    const sources = await this.prisma.icalSource.findMany({
      where: { villaId, deletedAt: null },
      select: SOURCE_SELECT,
      orderBy: { createdAt: 'asc' },
    });
    const threshold = Date.now() - HEALTHY_FOR_MS;
    return sources.map((source) => ({
      ...source,
      coverageStart: source.coverageStart && formatCalendarDate(source.coverageStart),
      coverageEnd: source.coverageEnd && formatCalendarDate(source.coverageEnd),
      healthy: source.status === 'ACTIVE' && !!source.lastSuccessAt && source.lastSuccessAt.getTime() > threshold,
      urlMasked: 'https://••••••/•••',
    }));
  }

  async preview(villaId: string, url: string, hostId?: string) {
    const villa = await this.assertScope(villaId, hostId);
    try {
      await this.assertExternalUrl(url);
      const { from, to } = this.coverageWindow(villa.timezone);
      const download = await downloadIcal(url);
      if (download.notModified) throw new IcalFetchError('ICAL_NOT_MODIFIED');
      const snapshot = parseIcal(download.text, from, to);
      if (!snapshot.events.length) throw new IcalReviewError('ICAL_UNEXPECTED_EMPTY');
      return {
        eventCount: snapshot.events.length,
        cancelledCount: snapshot.cancelled.length,
        from,
        to,
        sample: snapshot.events.slice(0, 5).map((event) => ({
          startDate: formatCalendarDate(event.startDate),
          endDate: formatCalendarDate(event.endDate),
        })),
      };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException({ message: 'iCal kaynağı doğrulanamadı.', code: this.errorCode(error) });
    }
  }

  async create(
    villaId: string,
    input: { label: string; url: string; required?: boolean },
    actorId: string,
    hostId?: string,
  ) {
    let normalized: string;
    try {
      normalized = normalizeIcalUrl(input.url);
      await this.assertExternalUrl(normalized);
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException({ message: 'iCal kaynağı doğrulanamadı.', code: this.errorCode(error) });
    }
    const urlHash = this.hash(normalized);
    let source;
    try {
      source = await this.occupancy.withVillaLock(villaId, async (tx) => {
        await this.assertScope(villaId, hostId, tx);
        const duplicate = await tx.icalSource.findUnique({ where: { urlHash } });
        if (duplicate && (!duplicate.deletedAt || duplicate.villaId !== villaId)) {
          throw new ConflictException('Bu iCal kaynağı zaten bağlı.');
        }
        const created = duplicate
          ? await tx.icalSource.update({
              where: { id: duplicate.id },
              data: {
                label: input.label.trim(),
                urlCiphertext: this.encrypt(normalized),
                required: input.required ?? true,
                status: 'PENDING',
                lastAttemptAt: null,
                lastSuccessAt: null,
                coverageStart: null,
                coverageEnd: null,
                etag: null,
                lastModified: null,
                nextSyncAt: new Date(),
                consecutiveFailures: 0,
                lastErrorCode: null,
                leaseToken: null,
                leaseExpiresAt: null,
                deletedAt: null,
                version: { increment: 1 },
              },
            })
          : await tx.icalSource.create({
              data: {
                villaId,
                label: input.label.trim(),
                urlCiphertext: this.encrypt(normalized),
                urlHash,
                required: input.required ?? true,
              },
            });
        await tx.villa.update({ where: { id: villaId }, data: { bookingMode: 'REQUEST' } });
        await tx.calendarAudit.create({
          data: {
            villaId,
            actorId,
            entityType: 'ICAL_SOURCE',
            entityId: created.id,
            action: duplicate ? 'ICAL_SOURCE_RECONNECTED' : 'ICAL_SOURCE_CREATED',
            after: { label: created.label, required: created.required },
          },
        });
        return created;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Bu iCal kaynağı zaten bağlı.');
      }
      throw error;
    }
    await this.syncSource(source.id, true);
    return this.list(villaId, hostId);
  }

  async syncScoped(villaId: string, sourceId: string, hostId?: string) {
    await this.sourceScoped(villaId, sourceId, hostId);
    return this.syncSource(sourceId, true);
  }

  async setPaused(
    villaId: string,
    sourceId: string,
    paused: boolean,
    expectedVersion: number,
    actorId: string,
    hostId?: string,
  ) {
    await this.occupancy.withVillaLock(villaId, async (tx) => {
      await this.assertScope(villaId, hostId, tx);
      const source = await tx.icalSource.findFirst({ where: { id: sourceId, villaId, deletedAt: null } });
      if (!source) throw new NotFoundException('iCal kaynağı bulunamadı.');
      this.assertVersion(source.version, expectedVersion);
      const status = paused ? 'PAUSED' : 'PENDING';
      await tx.icalSource.update({
        where: { id: sourceId },
        data: {
          status,
          nextSyncAt: paused ? source.nextSyncAt : new Date(),
          leaseToken: null,
          leaseExpiresAt: null,
          version: { increment: 1 },
        },
      });
      await tx.calendarAudit.create({
        data: {
          villaId,
          actorId,
          entityType: 'ICAL_SOURCE',
          entityId: sourceId,
          action: paused ? 'ICAL_SOURCE_PAUSED' : 'ICAL_SOURCE_RESUMED',
          before: { status: source.status },
          after: { status },
        },
      });
    });
    return this.list(villaId, hostId);
  }

  async remove(
    villaId: string,
    sourceId: string,
    input: { version: number; releaseBlocks?: boolean; reason: string },
    actorId: string,
    hostId?: string,
  ) {
    await this.occupancy.withVillaLock(villaId, async (tx, now) => {
      await this.assertScope(villaId, hostId, tx);
      const source = await tx.icalSource.findFirst({ where: { id: sourceId, villaId, deletedAt: null } });
      if (!source) throw new NotFoundException('iCal kaynağı bulunamadı.');
      this.assertVersion(source.version, input.version);
      const released = input.releaseBlocks
        ? await tx.villaBlockedDate.updateMany({
            where: { sourceId, state: 'ACTIVE' },
            data: { state: 'RELEASED', releasedAt: now, version: { increment: 1 } },
          })
        : { count: 0 };
      await tx.icalSource.update({
        where: { id: sourceId },
        data: { status: 'PAUSED', deletedAt: now, leaseToken: null, leaseExpiresAt: null, version: { increment: 1 } },
      });
      await tx.calendarAudit.create({
        data: {
          villaId,
          actorId,
          entityType: 'ICAL_SOURCE',
          entityId: sourceId,
          action: 'ICAL_SOURCE_REMOVED',
          reason: input.reason.trim(),
          before: { label: source.label, status: source.status },
          after: { blocksReleased: released.count },
        },
      });
    });
    return this.list(villaId, hostId);
  }

  async rotateExportToken(villaId: string, actorId: string, hostId?: string) {
    const token = randomBytes(32).toString('base64url');
    await this.occupancy.withVillaLock(villaId, async (tx, now) => {
      await this.assertScope(villaId, hostId, tx);
      await tx.villa.update({
        where: { id: villaId },
        data: { icalExportTokenHash: this.hash(token), icalExportTokenCreatedAt: now },
      });
      await tx.calendarAudit.create({
        data: {
          villaId,
          actorId,
          entityType: 'VILLA',
          entityId: villaId,
          action: 'ICAL_EXPORT_TOKEN_ROTATED',
        },
      });
    });
    return { token, path: `/api/calendar/${token}.ics` };
  }

  async exportCalendar(token: string) {
    if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) throw new NotFoundException('Takvim bulunamadı.');
    const villa = await this.prisma.villa.findUnique({
      where: { icalExportTokenHash: this.hash(token) },
      select: {
        id: true,
        icalExportTokenCreatedAt: true,
        bookings: {
          where: { status: 'CONFIRMED' },
          select: { id: true, checkIn: true, checkOut: true, updatedAt: true },
          orderBy: { id: 'asc' },
        },
        blockedDates: {
          where: { state: 'ACTIVE', kind: { not: 'ICAL' } },
          select: { id: true, startDate: true, endDate: true, updatedAt: true },
          orderBy: { id: 'asc' },
        },
      },
    });
    if (!villa) throw new NotFoundException('Takvim bulunamadı.');
    const entries = [
      ...villa.bookings.map((item) => ({ uid: `booking-${item.id}`, start: item.checkIn, end: item.checkOut, updatedAt: item.updatedAt })),
      ...villa.blockedDates.map((item) => ({ uid: `block-${item.id}`, start: item.startDate, end: item.endDate, updatedAt: item.updatedAt })),
    ];
    const fallback = villa.icalExportTokenCreatedAt ?? new Date(0);
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'PRODID:-//My Villa//Availability//TR',
      'X-WR-CALNAME:My Villa Availability',
      ...entries.flatMap((entry) => [
        'BEGIN:VEVENT',
        `UID:${entry.uid}@my-villa`,
        `DTSTAMP:${icalTimestamp(entry.updatedAt ?? fallback)}`,
        `DTSTART;VALUE=DATE:${icalDay(entry.start)}`,
        `DTEND;VALUE=DATE:${icalDay(entry.end)}`,
        'SUMMARY:Busy',
        'TRANSP:OPAQUE',
        'END:VEVENT',
      ]),
      'END:VCALENDAR',
      '',
    ];
    const body = lines.join('\r\n');
    return { body, etag: `"${this.hash(body)}"` };
  }

  async syncDue() {
    const due = await this.prisma.icalSource.findMany({
      where: {
        deletedAt: null,
        status: { in: ['PENDING', 'ACTIVE', 'ERROR', 'REVIEW'] },
        nextSyncAt: { lte: new Date() },
      },
      select: { id: true },
      take: 5,
      orderBy: { nextSyncAt: 'asc' },
    });
    await Promise.allSettled(due.map(({ id }) => this.syncSource(id)));
  }

  async syncSource(sourceId: string, force = false) {
    const lease = await this.acquireLease(sourceId, force);
    if (!lease) {
      if (force) throw new ConflictException('Bu kaynak şu anda eşitleniyor veya duraklatılmış.');
      return { status: 'SKIPPED' as const };
    }
    const run = await this.prisma.icalSyncRun.create({ data: { sourceId } });
    try {
      const url = this.decrypt(lease.urlCiphertext);
      const download = await downloadIcal(url, { etag: lease.etag, lastModified: lease.lastModified });
      if (download.notModified) {
        await this.finishNotModified(lease, run.id, download);
        return { status: 'NOT_MODIFIED' as const };
      }
      const timezone = await this.prisma.villa.findUniqueOrThrow({ where: { id: lease.villaId }, select: { timezone: true } });
      const { from, to } = this.coverageWindow(timezone.timezone);
      const snapshot = parseIcal(download.text, from, to);
      const counts = await this.applySnapshot(lease, run.id, snapshot, {
        etag: download.etag,
        lastModified: download.lastModified,
        httpStatus: download.status,
      });
      return { status: 'SUCCESS' as const, ...counts };
    } catch (error) {
      const code = this.errorCode(error);
      await this.finishFailure(lease, run.id, code, error instanceof IcalReviewError ? 'REVIEW' : 'FAILED');
      return { status: error instanceof IcalReviewError ? 'REVIEW' as const : 'FAILED' as const, errorCode: code };
    }
  }

  private async applySnapshot(
    lease: Lease,
    runId: string,
    snapshot: IcalSnapshot,
    meta: { etag?: string; lastModified?: string; httpStatus: number },
  ) {
    return this.occupancy.withVillaLock(lease.villaId, async (tx, now) => {
      const source = await tx.icalSource.findUnique({ where: { id: lease.id } });
      if (!source || source.leaseToken === null || source.leaseToken !== lease.leaseToken || source.version !== lease.version) {
        throw new IcalReviewError('ICAL_STALE_WORKER');
      }
      const allBlocks = await tx.villaBlockedDate.findMany({ where: { sourceId: source.id } });
      const activeInCoverage = allBlocks.filter(
        (block) => block.state === 'ACTIVE' && block.startDate < snapshot.coverageEnd && block.endDate > snapshot.coverageStart,
      );
      if (!snapshot.events.length && !snapshot.cancelled.length) throw new IcalReviewError('ICAL_UNEXPECTED_EMPTY');

      const byIdentity = new Map(allBlocks.map((block) => [`${block.externalUid}\u0000${block.externalRecurrence}`, block]));
      const seen = new Set<string>();
      const cancelled = new Set(snapshot.cancelled.map((item) => `${item.uid}\u0000${item.recurrenceId}`));
      const audits: Prisma.CalendarAuditCreateManyInput[] = [];
      let addedCount = 0;
      let updatedCount = 0;
      let releasedCount = 0;

      for (const event of snapshot.events) {
        const key = `${event.uid}\u0000${event.recurrenceId}`;
        seen.add(key);
        const existing = byIdentity.get(key);
        if (!existing) {
          const id = randomUUID();
          await tx.villaBlockedDate.create({
            data: {
              id,
              villaId: lease.villaId,
              startDate: event.startDate,
              endDate: event.endDate,
              kind: 'ICAL',
              note: source.label,
              sourceId: source.id,
              externalUid: event.uid,
              externalRecurrence: event.recurrenceId,
              externalFingerprint: event.fingerprint,
            },
          });
          audits.push(this.syncAudit(lease.villaId, id, 'ICAL_BLOCK_CREATED', event));
          addedCount += 1;
          continue;
        }
        const changed =
          existing.state !== 'ACTIVE' || existing.startDate.getTime() !== event.startDate.getTime() ||
          existing.endDate.getTime() !== event.endDate.getTime() || existing.externalFingerprint !== event.fingerprint;
        if (changed || existing.missingCount) {
          await tx.villaBlockedDate.update({
            where: { id: existing.id },
            data: {
              startDate: event.startDate,
              endDate: event.endDate,
              state: 'ACTIVE',
              releasedAt: null,
              externalFingerprint: event.fingerprint,
              missingCount: 0,
              version: { increment: 1 },
            },
          });
          if (changed) {
            audits.push(this.syncAudit(lease.villaId, existing.id, 'ICAL_BLOCK_UPDATED', event));
            updatedCount += 1;
          }
        }
      }

      for (const block of activeInCoverage) {
        const key = `${block.externalUid}\u0000${block.externalRecurrence}`;
        if (seen.has(key)) continue;
        if (cancelled.has(key) || block.missingCount >= 1) {
          await tx.villaBlockedDate.update({
            where: { id: block.id },
            data: { state: 'RELEASED', releasedAt: now, missingCount: 0, version: { increment: 1 } },
          });
          audits.push(this.syncAudit(lease.villaId, block.id, 'ICAL_BLOCK_RELEASED'));
          releasedCount += 1;
        } else {
          await tx.villaBlockedDate.update({
            where: { id: block.id },
            data: { missingCount: { increment: 1 }, version: { increment: 1 } },
          });
        }
      }

      const [{ count: conflictCount }] = await tx.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(DISTINCT b.id) AS count
        FROM "Booking" b
        JOIN "VillaBlockedDate" d ON d."villaId" = b."villaId"
          AND d."startDate" < b."checkOut" AND d."endDate" > b."checkIn"
        WHERE d."sourceId" = ${source.id} AND d.state = 'ACTIVE'
          AND b.status IN ('HOLD', 'CONFIRMED')
          AND (b.status <> 'HOLD' OR b."holdExpiresAt" > ${now})
      `;
      if (audits.length) await tx.calendarAudit.createMany({ data: audits });
      await tx.calendarAudit.create({
        data: {
          villaId: lease.villaId,
          entityType: 'ICAL_SOURCE',
          entityId: source.id,
          action: 'ICAL_SYNC_COMPLETED',
          after: { addedCount, updatedCount, releasedCount, conflictCount: Number(conflictCount) },
        },
      });
      await tx.icalSource.update({
        where: { id: source.id },
        data: {
          status: 'ACTIVE',
          lastSuccessAt: now,
          coverageStart: snapshot.coverageStart,
          coverageEnd: snapshot.coverageEnd,
          etag: meta.etag,
          lastModified: meta.lastModified,
          nextSyncAt: new Date(now.getTime() + SYNC_INTERVAL_MS + Math.floor(Math.random() * 120_000)),
          consecutiveFailures: 0,
          lastErrorCode: null,
          leaseToken: null,
          leaseExpiresAt: null,
          version: { increment: 1 },
        },
      });
      await tx.icalSyncRun.update({
        where: { id: runId },
        data: {
          status: 'SUCCESS',
          addedCount,
          updatedCount,
          releasedCount,
          conflictCount: Number(conflictCount),
          httpStatus: meta.httpStatus,
          finishedAt: now,
        },
      });
      return { addedCount, updatedCount, releasedCount, conflictCount: Number(conflictCount) };
    });
  }

  private async acquireLease(sourceId: string, force: boolean): Promise<Lease | null> {
    const token = randomUUID();
    const rows = force
      ? await this.prisma.$queryRaw<Lease[]>`
          UPDATE "IcalSource" SET "leaseToken" = ${token}, "leaseExpiresAt" = clock_timestamp() + INTERVAL '2 minutes',
            "lastAttemptAt" = clock_timestamp(), "version" = "version" + 1
          WHERE id = ${sourceId} AND "deletedAt" IS NULL AND status <> 'PAUSED'
            AND ("leaseExpiresAt" IS NULL OR "leaseExpiresAt" < clock_timestamp())
          RETURNING id, "villaId", label, "urlCiphertext", etag, "lastModified", version, "leaseToken"
        `
      : await this.prisma.$queryRaw<Lease[]>`
          UPDATE "IcalSource" SET "leaseToken" = ${token}, "leaseExpiresAt" = clock_timestamp() + INTERVAL '2 minutes',
            "lastAttemptAt" = clock_timestamp(), "version" = "version" + 1
          WHERE id = ${sourceId} AND "deletedAt" IS NULL AND status <> 'PAUSED'
            AND "nextSyncAt" <= clock_timestamp()
            AND ("leaseExpiresAt" IS NULL OR "leaseExpiresAt" < clock_timestamp())
          RETURNING id, "villaId", label, "urlCiphertext", etag, "lastModified", version, "leaseToken"
        `;
    if (!rows[0]) return null;
    await this.prisma.icalSyncRun.updateMany({
      where: { sourceId, status: 'RUNNING', startedAt: { lt: new Date(Date.now() - LEASE_MS) } },
      data: { status: 'FAILED', errorCode: 'ICAL_WORKER_EXPIRED', finishedAt: new Date() },
    });
    return rows[0];
  }

  private async finishNotModified(
    lease: Lease,
    runId: string,
    download: { status: 304; etag?: string; lastModified?: string },
  ) {
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.icalSource.updateMany({
        where: { id: lease.id, leaseToken: lease.leaseToken, version: lease.version },
        data: {
          status: 'ACTIVE',
          lastSuccessAt: now,
          etag: download.etag ?? lease.etag,
          lastModified: download.lastModified ?? lease.lastModified,
          nextSyncAt: new Date(now.getTime() + SYNC_INTERVAL_MS),
          consecutiveFailures: 0,
          lastErrorCode: null,
          leaseToken: null,
          leaseExpiresAt: null,
          version: { increment: 1 },
        },
      });
      if (!updated.count) throw new IcalReviewError('ICAL_STALE_WORKER');
      await tx.icalSyncRun.update({
        where: { id: runId },
        data: { status: 'NOT_MODIFIED', httpStatus: 304, finishedAt: now },
      });
    });
  }

  private async finishFailure(lease: Lease, runId: string, code: string, runStatus: 'FAILED' | 'REVIEW') {
    const current = await this.prisma.icalSource.findUnique({ where: { id: lease.id }, select: { consecutiveFailures: true } });
    const failures = (current?.consecutiveFailures ?? 0) + 1;
    const delayMinutes = Math.min(15 * 2 ** Math.min(failures - 1, 5), 360);
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.icalSource.updateMany({
        where: { id: lease.id, leaseToken: lease.leaseToken, version: lease.version },
        data: {
          status: runStatus === 'REVIEW' ? 'REVIEW' : 'ERROR',
          consecutiveFailures: failures,
          lastErrorCode: code,
          nextSyncAt: new Date(now.getTime() + delayMinutes * 60_000),
          leaseToken: null,
          leaseExpiresAt: null,
          version: { increment: 1 },
        },
      }),
      this.prisma.icalSyncRun.update({
        where: { id: runId },
        data: { status: runStatus, errorCode: code, finishedAt: now },
      }),
    ]);
  }

  private async assertExternalUrl(raw: string) {
    const normalized = normalizeIcalUrl(raw);
    const match = new URL(normalized).pathname.match(/\/calendar\/([A-Za-z0-9_-]{40,60})\.ics$/);
    if (match) {
      const own = await this.prisma.villa.findUnique({
        where: { icalExportTokenHash: this.hash(match[1]) },
        select: { id: true },
      });
      if (own) throw new BadRequestException('Sistemin kendi dışa aktarım adresi içe aktarılamaz.');
    }
  }

  private async assertScope(villaId: string, hostId?: string, tx: Prisma.TransactionClient | PrismaService = this.prisma) {
    const villa = await tx.villa.findFirst({
      where: { id: villaId, ...(hostId ? { hostId } : {}) },
      select: { id: true, timezone: true },
    });
    if (!villa) throw new NotFoundException('Villa bulunamadı.');
    return villa;
  }

  private async sourceScoped(villaId: string, sourceId: string, hostId?: string) {
    await this.assertScope(villaId, hostId);
    const source = await this.prisma.icalSource.findFirst({ where: { id: sourceId, villaId, deletedAt: null }, select: { id: true } });
    if (!source) throw new NotFoundException('iCal kaynağı bulunamadı.');
    return source;
  }

  private assertVersion(actual: number, expected: number) {
    if (actual !== expected) throw new ConflictException('iCal kaynağı başka bir işlem tarafından değiştirildi.');
  }

  private coverageWindow(timezone: string) {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(new Date())
      .reduce<Record<string, string>>((result, part) => ({ ...result, [part.type]: part.value }), {});
    const from = `${parts.year}-${parts.month}-${parts.day}`;
    const start = new Date(`${from}T00:00:00.000Z`);
    const end = new Date(Date.UTC(start.getUTCFullYear() + 1, start.getUTCMonth(), start.getUTCDate()));
    return { from, to: formatCalendarDate(end) };
  }

  private encrypt(value: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey(), iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url');
  }

  private decrypt(value: string) {
    const data = Buffer.from(value, 'base64url');
    const decipher = createDecipheriv('aes-256-gcm', this.encryptionKey(), data.subarray(0, 12));
    decipher.setAuthTag(data.subarray(12, 28));
    return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString('utf8');
  }

  private encryptionKey() {
    const secret = process.env.ICAL_ENCRYPTION_KEY ?? process.env.JWT_SECRET;
    if (!secret || secret.length < 16) throw new BadRequestException('ICAL_ENCRYPTION_KEY yapılandırılmalı.');
    return createHash('sha256').update(secret).digest();
  }

  private hash(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }

  private errorCode(error: unknown) {
    if (error instanceof IcalReviewError || error instanceof IcalFetchError) return error.code;
    if (error instanceof BadRequestException) {
      const response = error.getResponse();
      if (typeof response === 'object' && response && 'code' in response) return String(response.code);
    }
    return 'ICAL_SYNC_ERROR';
  }

  private syncAudit(villaId: string, entityId: string, action: string, event?: { startDate: Date; endDate: Date }) {
    return {
      id: randomUUID(),
      villaId,
      entityType: 'BLOCK',
      entityId,
      action,
      after: event ? { startDate: formatCalendarDate(event.startDate), endDate: formatCalendarDate(event.endDate), kind: 'ICAL' } : undefined,
    } satisfies Prisma.CalendarAuditCreateManyInput;
  }
}

function icalDay(date: Date) {
  return formatCalendarDate(date).replaceAll('-', '');
}

function icalTimestamp(date: Date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}
