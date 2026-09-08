import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type BookingChannel, type BookingPaymentStatus, type BookingStatus } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma.service';
import { SettingsService } from '../settings/settings.service';
import { formatCalendarDate, parseCalendarDate, parseStayDates } from '../villas/availability';
import type { AdminCreateBookingDto, ChangeBookingDto, CreateHoldDto, OwnBookingListDto } from './dto';
import { OccupancyService } from './occupancy.service';
import { paymentReference, prepaymentFor, readPaymentSettings, revealGuestContact } from './payment';

const HOLD_MINUTES = 10;
const MAX_ACTIVE_HOLDS = 5;

const BOOKING_SELECT = {
  id: true,
  villaId: true,
  guestId: true,
  status: true,
  channel: true,
  checkIn: true,
  checkOut: true,
  adults: true,
  children: true,
  infants: true,
  customerName: true,
  customerEmail: true,
  customerPhone: true,
  currency: true,
  accommodationAmount: true,
  cleaningFeeAmount: true,
  depositAmount: true,
  totalAmount: true,
  priceSnapshot: true,
  paymentStatus: true,
  prepaymentAmount: true,
  paymentDeclaredAt: true,
  holdExpiresAt: true,
  confirmedAt: true,
  cancelledAt: true,
  cancellationNote: true,
  version: true,
  createdAt: true,
  updatedAt: true,
  villa: { select: { title: true, slug: true } },
} as const;

type BookingRecord = Prisma.BookingGetPayload<{ select: typeof BOOKING_SELECT }>;

@Injectable()
export class BookingsService {
  constructor(
    private prisma: PrismaService,
    private occupancy: OccupancyService,
    private settings: SettingsService,
  ) {}

  async createHold(input: CreateHoldDto, userId: string, idempotencyKey?: string) {
    const key = this.idempotencyKey(idempotencyKey);
    const owner = `guest:${userId}`;
    const normalized = this.normalizeStay(input);
    const requestHash = this.hash({ villaId: input.villaId, ...normalized });
    // Ayarlar kilit ALTINDA okunmaz: açık transaction içinden ikinci bir sorgu
    // havuzdan yeni bağlantı ister ve eşzamanlı bekletmelerde kilitlenme yaratır.
    const payment = readPaymentSettings(await this.settings.get('payments'));

    try {
      return await this.occupancy.withVillaLock(input.villaId, async (tx, now) => {
        const existing = await this.findIdempotent(tx, owner, key, requestHash);
        if (existing) return this.response(existing);

        const guest = await tx.$queryRaw<{ id: string; name: string; email: string; phone: string | null }[]>`
          SELECT id, name, email, phone FROM "User" WHERE id = ${userId} AND active = true FOR UPDATE
        `;
        if (!guest.length) throw new ForbiddenException('Aktif misafir hesabı bulunamadı.');
        const activeHolds = await tx.booking.count({
          where: { guestId: userId, status: 'HOLD', holdExpiresAt: { gt: now } },
        });
        if (activeHolds >= MAX_ACTIVE_HOLDS) {
          throw new ConflictException({
            message: 'Aynı anda en fazla beş villa bekletebilirsiniz.',
            code: 'ACTIVE_HOLD_LIMIT',
          });
        }

        const dates = parseStayDates(input.from, input.to);
        const { villa, result } = await this.occupancy.checkAvailability(tx, input.villaId, dates, normalized);
        if (villa.bookingMode !== 'INSTANT') {
          throw new ConflictException({
            message: 'Bu villa için önce rezervasyon talebi gönderilmelidir.',
            code: 'REQUEST_ONLY',
          });
        }
        this.assertAvailable(result.reasons);
        const quote = this.occupancy.quote(villa, dates);
        const booking = await tx.booking.create({
          data: {
            villaId: input.villaId,
            guestId: userId,
            status: 'HOLD',
            channel: 'WEBSITE',
            checkIn: dates.checkIn,
            checkOut: dates.checkOut,
            ...normalized,
            // İletişim bilgisi boşsa hesaptaki bilgi yazılır; misafir hesabını
            // sonradan değiştirse de rezervasyonun kimin adına açıldığı sabit kalır.
            customerName: input.customerName?.trim() || guest[0].name,
            customerEmail: input.customerEmail?.trim().toLowerCase() || guest[0].email,
            customerPhone: input.customerPhone?.trim() || guest[0].phone || undefined,
            ...quote,
            priceSnapshot: quote.priceSnapshot as Prisma.InputJsonValue,
            paymentStatus: 'PENDING',
            prepaymentAmount: prepaymentFor(quote.totalAmount, payment, villa.commissionRate),
            holdExpiresAt: new Date(now.getTime() + HOLD_MINUTES * 60_000),
            idempotencyOwner: owner,
            idempotencyKey: key,
            requestHash,
          },
          select: BOOKING_SELECT,
        });
        await this.audit(tx, booking, userId, 'HOLD_CREATED', undefined, {
          status: booking.status,
          checkIn: formatCalendarDate(booking.checkIn),
          checkOut: formatCalendarDate(booking.checkOut),
          holdExpiresAt: booking.holdExpiresAt?.toISOString(),
        });
        return this.response(booking);
      });
    } catch (error) {
      return this.recoverIdempotency(error, owner, key, requestHash);
    }
  }

  async createConfirmed(input: AdminCreateBookingDto, actorId: string, idempotencyKey?: string) {
    if (!input.guestId && (!input.customerName || (!input.customerEmail && !input.customerPhone))) {
      throw new BadRequestException('Üye veya misafir adıyla birlikte e-posta/telefon gerekli.');
    }
    const key = this.idempotencyKey(idempotencyKey);
    const owner = `admin:${actorId}`;
    const normalized = this.normalizeStay(input);
    const requestHash = this.hash({
      villaId: input.villaId,
      guestId: input.guestId ?? null,
      customerName: input.customerName?.trim() ?? null,
      customerEmail: input.customerEmail?.trim().toLowerCase() ?? null,
      customerPhone: input.customerPhone?.trim() ?? null,
      ...normalized,
    });

    try {
      return await this.occupancy.withVillaLock(input.villaId, async (tx, now) => {
        const existing = await this.findIdempotent(tx, owner, key, requestHash);
        if (existing) return this.response(existing);
        if (input.guestId) {
          const guest = await tx.user.findUnique({ where: { id: input.guestId }, select: { active: true } });
          if (!guest?.active) throw new BadRequestException('Aktif üye bulunamadı.');
        }

        const dates = parseStayDates(input.from, input.to);
        const { villa, result } = await this.occupancy.checkAvailability(tx, input.villaId, dates, normalized);
        this.assertAvailable(result.reasons);
        const quote = this.occupancy.quote(villa, dates);
        const booking = await tx.booking.create({
          data: {
            villaId: input.villaId,
            guestId: input.guestId,
            status: 'CONFIRMED',
            channel: 'ADMIN',
            checkIn: dates.checkIn,
            checkOut: dates.checkOut,
            ...normalized,
            customerName: input.customerName?.trim(),
            customerEmail: input.customerEmail?.trim().toLowerCase(),
            customerPhone: input.customerPhone?.trim(),
            ...quote,
            priceSnapshot: quote.priceSnapshot as Prisma.InputJsonValue,
            confirmedAt: now,
            idempotencyOwner: owner,
            idempotencyKey: key,
            requestHash,
          },
          select: BOOKING_SELECT,
        });
        await this.audit(tx, booking, actorId, 'BOOKING_CREATED', undefined, {
          status: booking.status,
          checkIn: formatCalendarDate(booking.checkIn),
          checkOut: formatCalendarDate(booking.checkOut),
        });
        return this.response(booking);
      });
    } catch (error) {
      return this.recoverIdempotency(error, owner, key, requestHash);
    }
  }

  async confirm(id: string, expectedVersion: number, actorId: string, hostId?: string) {
    // Kapora platformun parası — ev sahibi onu görmez/doğrulayamaz, onayı yalnızca admin verir.
    if (hostId) throw new ForbiddenException('Kapora onayı yalnızca yönetici tarafından yapılabilir.');
    const target = await this.bookingTarget(id, hostId);
    return this.occupancy.withVillaLock(target.villaId, async (tx, now) => {
      const booking = await tx.booking.findUnique({ where: { id }, select: BOOKING_SELECT });
      if (!booking) throw new NotFoundException('Rezervasyon bulunamadı.');
      if (booking.status === 'CONFIRMED') return this.response(booking, hostId);
      this.assertVersion(booking.version, expectedVersion);
      if (booking.status !== 'HOLD') throw new ConflictException('Bu rezervasyon artık onaylanamaz.');

      const dates = { checkIn: booking.checkIn, checkOut: booking.checkOut, nights: this.nights(booking) };
      const { result } = await this.occupancy.checkAvailability(
        tx,
        booking.villaId,
        dates,
        { adults: booking.adults, children: booking.children, infants: booking.infants },
        booking.id,
      );
      this.assertAvailable(result.reasons);

      const updated = await tx.booking.update({
        where: { id },
        data: {
          status: 'CONFIRMED',
          holdExpiresAt: null,
          confirmedAt: now,
          // POS yok: onayı veren admin dekontu görmüş sayılır, ayrı bir "ödendi"
          // işlemi yok. Ödeme beklenmeyen (NONE) admin kayıtları olduğu gibi kalır.
          ...(booking.paymentStatus === 'NONE' ? {} : { paymentStatus: 'PAID' as const }),
          version: { increment: 1 },
        },
        select: BOOKING_SELECT,
      });
      await this.audit(tx, updated, actorId, 'BOOKING_CONFIRMED', { status: booking.status }, {
        status: updated.status,
      });
      return this.response(updated, hostId);
    });
  }

  async change(id: string, input: ChangeBookingDto, actorId: string, hostId?: string) {
    const target = await this.bookingTarget(id, hostId);
    const normalized = this.normalizeStay(input);
    const dates = parseStayDates(input.from, input.to);
    const payment = readPaymentSettings(await this.settings.get('payments'));
    return this.occupancy.withVillaLock(target.villaId, async (tx) => {
      const booking = await tx.booking.findUnique({ where: { id }, select: BOOKING_SELECT });
      if (!booking) throw new NotFoundException('Rezervasyon bulunamadı.');
      this.assertVersion(booking.version, input.version);
      if (!(['HOLD', 'CONFIRMED'] as BookingStatus[]).includes(booking.status)) {
        throw new ConflictException('Bu rezervasyon değiştirilemez.');
      }

      const { villa, result } = await this.occupancy.checkAvailability(tx, booking.villaId, dates, normalized, id);
      this.assertAvailable(result.reasons);
      const quote = this.occupancy.quote(villa, dates);
      // Tarih değişince toplam da değişir; kapora yeniden hesaplanmazsa toplamı
      // aşabilir (veritabanındaki Booking_prepayment_range kısıtı buna izin vermez).
      const prepaymentAmount =
        booking.paymentStatus === 'NONE'
          ? booking.prepaymentAmount
          : prepaymentFor(quote.totalAmount, payment, villa.commissionRate);
      const updated = await tx.booking.update({
        where: { id },
        data: {
          checkIn: dates.checkIn,
          checkOut: dates.checkOut,
          ...normalized,
          ...quote,
          priceSnapshot: quote.priceSnapshot as Prisma.InputJsonValue,
          prepaymentAmount,
          version: { increment: 1 },
        },
        select: BOOKING_SELECT,
      });
      await this.audit(
        tx,
        updated,
        actorId,
        'BOOKING_CHANGED',
        {
          checkIn: formatCalendarDate(booking.checkIn),
          checkOut: formatCalendarDate(booking.checkOut),
          adults: booking.adults,
          children: booking.children,
          infants: booking.infants,
          totalAmount: booking.totalAmount,
          prepaymentAmount: booking.prepaymentAmount,
        },
        {
          checkIn: formatCalendarDate(updated.checkIn),
          checkOut: formatCalendarDate(updated.checkOut),
          adults: updated.adults,
          children: updated.children,
          infants: updated.infants,
          totalAmount: updated.totalAmount,
          prepaymentAmount: updated.prepaymentAmount,
        },
      );
      return this.response(updated, hostId);
    });
  }

  async cancel(id: string, expectedVersion: number, note: string, actorId: string, hostId?: string) {
    const target = await this.bookingTarget(id, hostId);
    return this.occupancy.withVillaLock(target.villaId, async (tx, now) => {
      const booking = await tx.booking.findUnique({ where: { id }, select: BOOKING_SELECT });
      if (!booking) throw new NotFoundException('Rezervasyon bulunamadı.');
      if (booking.status === 'CANCELLED') return this.response(booking, hostId);
      this.assertVersion(booking.version, expectedVersion);
      if (booking.status === 'EXPIRED') throw new ConflictException('Süresi dolmuş rezervasyon iptal edilemez.');
      // Onaylanmış rezervasyonda kapora zaten platforma yatmıştır; iade kararı
      // ev sahibinin değil, yönetimin. Bkz. BookingsService.confirm().
      if (hostId && booking.status === 'CONFIRMED') {
        throw new ForbiddenException('Onaylanmış bir rezervasyonu ev sahibi doğrudan iptal edemez. Yönetimle iletişime geçin.');
      }
      const updated = await tx.booking.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          cancelledAt: now,
          cancellationNote: note.trim(),
          version: { increment: 1 },
        },
        select: BOOKING_SELECT,
      });
      await this.audit(tx, updated, actorId, 'BOOKING_CANCELLED', { status: booking.status }, {
        status: updated.status,
      }, note.trim());
      return this.response(updated, hostId);
    });
  }

  async releaseOwnHold(id: string, userId: string) {
    const target = await this.prisma.booking.findFirst({
      where: { id, guestId: userId },
      select: { villaId: true },
    });
    if (!target) throw new NotFoundException('Rezervasyon bulunamadı.');
    return this.occupancy.withVillaLock(target.villaId, async (tx, now) => {
      const booking = await tx.booking.findFirst({ where: { id, guestId: userId }, select: BOOKING_SELECT });
      if (!booking) throw new NotFoundException('Rezervasyon bulunamadı.');
      if (booking.status === 'EXPIRED' || booking.status === 'CANCELLED') return this.response(booking);
      if (booking.status !== 'HOLD') throw new ForbiddenException('Onaylı rezervasyonu yalnızca destek ekibi iptal edebilir.');
      const updated = await tx.booking.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          cancelledAt: now,
          cancellationNote: 'Misafir bekletmeyi bıraktı.',
          version: { increment: 1 },
        },
        select: BOOKING_SELECT,
      });
      await this.audit(tx, updated, userId, 'HOLD_RELEASED', { status: booking.status }, {
        status: updated.status,
      }, 'Misafir bekletmeyi bıraktı.');
      return this.response(updated);
    });
  }

  /**
   * Misafirin havale bildirimi. Bekletme 10 dakikalıktır; banka havalesi o süreye
   * sığmaz. Bildirimle birlikte bekletme adminin belirlediği ödeme süresi kadar
   * uzatılır — geceler dekont incelenirken açık kalmaz.
   */
  async declarePayment(id: string, userId: string) {
    const target = await this.prisma.booking.findFirst({
      where: { id, guestId: userId },
      select: { villaId: true },
    });
    if (!target) throw new NotFoundException('Rezervasyon bulunamadı.');
    const settings = readPaymentSettings(await this.settings.get('payments'));

    return this.occupancy.withVillaLock(target.villaId, async (tx, now) => {
      const booking = await tx.booking.findFirst({ where: { id, guestId: userId }, select: BOOKING_SELECT });
      if (!booking) throw new NotFoundException('Rezervasyon bulunamadı.');
      // Tekrar gönderim sessizce aynı yanıtı döner; onaylanmış kaydı da bozmaz.
      if (booking.paymentStatus === 'DECLARED' || booking.paymentStatus === 'PAID') {
        return this.ownResponse(booking, settings);
      }
      if (booking.status !== 'HOLD' || booking.paymentStatus !== 'PENDING') {
        throw new ConflictException('Bu rezervasyon için ödeme bildirimi yapılamaz.');
      }

      const deadline = new Date(now.getTime() + settings.deadlineHours * 3_600_000);
      const updated = await tx.booking.update({
        where: { id },
        data: {
          paymentStatus: 'DECLARED',
          paymentDeclaredAt: now,
          holdExpiresAt: deadline,
          version: { increment: 1 },
        },
        select: BOOKING_SELECT,
      });
      await this.audit(tx, updated, userId, 'PAYMENT_DECLARED', {
        paymentStatus: booking.paymentStatus,
        holdExpiresAt: booking.holdExpiresAt?.toISOString() ?? null,
      }, {
        paymentStatus: updated.paymentStatus,
        holdExpiresAt: deadline.toISOString(),
        prepaymentAmount: updated.prepaymentAmount,
      });
      return this.ownResponse(updated, settings);
    });
  }

  async getOwn(id: string, userId: string) {
    const booking = await this.prisma.booking.findFirst({ where: { id, guestId: userId }, select: BOOKING_SELECT });
    if (!booking) throw new NotFoundException('Rezervasyon bulunamadı.');
    return this.ownResponse(booking, readPaymentSettings(await this.settings.get('payments')));
  }

  async listOwn(userId: string, input: OwnBookingListDto) {
    const page = Math.max(input.page ?? 1, 1);
    const pageSize = Math.min(Math.max(input.pageSize ?? 12, 1), 50);
    const scope = input.scope ?? 'all';
    const today = parseCalendarDate(this.todayInIstanbul());
    const scopedWhere: Prisma.BookingWhereInput =
      scope === 'action-required'
        ? { status: 'HOLD', paymentStatus: 'PENDING', holdExpiresAt: { gt: new Date() } }
        : scope === 'upcoming'
          ? { status: 'CONFIRMED', checkOut: { gt: today } }
          : scope === 'past'
            ? { status: 'CONFIRMED', checkOut: { lte: today } }
            : scope === 'cancelled'
              ? { status: { in: ['CANCELLED', 'EXPIRED'] } }
              : {};
    const where: Prisma.BookingWhereInput = { guestId: userId, ...scopedWhere };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.booking.findMany({
        where,
        select: BOOKING_SELECT,
        orderBy: scope === 'upcoming' ? { checkIn: 'asc' } : { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.booking.count({ where }),
    ]);
    return { items: items.map((item) => this.response(item)), total, page, pageSize };
  }

  private todayInIstanbul() {
    const parts = new Intl.DateTimeFormat('en', {
      timeZone: 'Europe/Istanbul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
    return `${get('year')}-${get('month')}-${get('day')}`;
  }

  async getAdmin(id: string, hostId?: string) {
    const booking = await this.prisma.booking.findFirst({
      where: { id, ...(hostId ? { villa: { hostId } } : {}) },
      select: BOOKING_SELECT,
    });
    if (!booking) throw new NotFoundException('Rezervasyon bulunamadı.');
    const audits = await this.prisma.calendarAudit.findMany({
      where: { entityType: 'BOOKING', entityId: id, ...(hostId ? { villa: { hostId } } : {}) },
      select: {
        id: true,
        villaId: true,
        entityType: true,
        entityId: true,
        action: true,
        reason: true,
        before: true,
        after: true,
        createdAt: true,
        villa: { select: { title: true } },
        actor: { select: { name: true, role: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const safeAudits = !revealGuestContact(hostId, booking.status)
      ? audits.map((audit) => ({
          ...audit,
          actor: audit.actor?.role === 'GUEST' ? { ...audit.actor, name: 'Misafir' } : audit.actor,
        }))
      : audits;
    return { ...this.response(booking, hostId), audits: safeAudits };
  }

  async listAdmin(input: {
    status?: BookingStatus;
    paymentStatus?: BookingPaymentStatus;
    channel?: BookingChannel;
    villaId?: string;
    q?: string;
    from?: string;
    to?: string;
    page?: number;
    pageSize?: number;
    hostId?: string;
  }) {
    const page = Math.max(input.page ?? 1, 1);
    const pageSize = Math.min(Math.max(input.pageSize ?? 20, 1), 100);
    const q = input.q?.trim();
    const referenceQuery = q?.replace(/^MV-/i, '');
    const from = input.from ? parseCalendarDate(input.from) : undefined;
    const to = input.to ? parseCalendarDate(input.to) : undefined;
    if (from && to && from >= to) throw new BadRequestException('Tarih filtresinde bitiş başlangıçtan sonra olmalı.');
    const where: Prisma.BookingWhereInput = {
      ...(input.status ? { status: input.status } : {}),
      ...(input.paymentStatus ? { paymentStatus: input.paymentStatus } : {}),
      ...(input.channel ? { channel: input.channel } : {}),
      ...(input.villaId ? { villaId: input.villaId } : {}),
      ...(input.hostId ? { villa: { hostId: input.hostId } } : {}),
      ...(from ? { checkOut: { gt: from } } : {}),
      ...(to ? { checkIn: { lt: to } } : {}),
      ...(q
        ? {
            OR: [
              { customerName: { contains: q, mode: 'insensitive' } },
              { customerEmail: { contains: q, mode: 'insensitive' } },
              { customerPhone: { contains: q, mode: 'insensitive' } },
              { id: { contains: referenceQuery, mode: 'insensitive' } },
              { villa: { title: { contains: q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.booking.findMany({
        where,
        select: BOOKING_SELECT,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.booking.count({ where }),
    ]);
    return { items: items.map((item) => this.response(item, input.hostId)), total, page, pageSize };
  }

  private normalizeStay(input: { adults: number; children?: number; infants?: number }) {
    return { adults: input.adults, children: input.children ?? 0, infants: input.infants ?? 0 };
  }

  private idempotencyKey(value?: string) {
    if (!value || !/^[A-Za-z0-9._:-]{8,100}$/.test(value)) {
      throw new BadRequestException('Idempotency-Key başlığı 8–100 güvenli karakter içermeli.');
    }
    return value;
  }

  private hash(value: unknown) {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }

  private async findIdempotent(
    tx: Prisma.TransactionClient,
    owner: string,
    key: string,
    requestHash: string,
  ) {
    const existing = await tx.booking.findUnique({
      where: { idempotencyOwner_idempotencyKey: { idempotencyOwner: owner, idempotencyKey: key } },
      select: { ...BOOKING_SELECT, requestHash: true },
    });
    if (existing && existing.requestHash !== requestHash) {
      throw new ConflictException('Bu idempotency anahtarı farklı bir istek için kullanılmış.');
    }
    return existing;
  }

  private async recoverIdempotency(error: unknown, owner: string, key: string, requestHash: string) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const existing = await this.prisma.booking.findUnique({
        where: { idempotencyOwner_idempotencyKey: { idempotencyOwner: owner, idempotencyKey: key } },
        select: { ...BOOKING_SELECT, requestHash: true },
      });
      if (existing?.requestHash === requestHash) return this.response(existing);
      throw new ConflictException('Bu idempotency anahtarı farklı bir istek için kullanılmış.');
    }
    throw error;
  }

  private assertAvailable(reasons: string[]) {
    if (reasons.length) {
      throw new ConflictException({
        message: 'Seçilen villa bu koşullarda müsait değil.',
        code: reasons[0],
        reasons,
      });
    }
  }

  private assertVersion(actual: number, expected: number) {
    if (actual !== expected) throw new ConflictException('Rezervasyon başka bir işlem tarafından değiştirildi.');
  }

  private async bookingTarget(id: string, hostId?: string) {
    const booking = await this.prisma.booking.findFirst({
      where: { id, ...(hostId ? { villa: { hostId } } : {}) },
      select: { villaId: true },
    });
    if (!booking) throw new NotFoundException('Rezervasyon bulunamadı.');
    return booking;
  }

  private nights(booking: { checkIn: Date; checkOut: Date }) {
    return Math.round((booking.checkOut.getTime() - booking.checkIn.getTime()) / 86_400_000);
  }

  private audit(
    tx: Prisma.TransactionClient,
    booking: { id: string; villaId: string },
    actorId: string,
    action: string,
    before?: Prisma.InputJsonObject,
    after?: Prisma.InputJsonObject,
    reason?: string,
  ) {
    return tx.calendarAudit.create({
      data: {
        villaId: booking.villaId,
        actorId,
        entityType: 'BOOKING',
        entityId: booking.id,
        action,
        reason,
        before,
        after,
      },
    });
  }

  /**
   * Havale bilgisi yalnızca kendi rezervasyonunu görüntüleyen misafire eklenir.
   * IBAN halka açık ayar ucundan servis edilmez (bkz. settings.controller).
   */
  private ownResponse(booking: BookingRecord, settings: ReturnType<typeof readPaymentSettings>) {
    const base = this.response(booking);
    if (booking.paymentStatus === 'NONE') return base;
    return {
      ...base,
      payment: {
        reference: paymentReference(booking.id),
        amount: booking.prepaymentAmount,
        currency: booking.currency,
        accountHolder: settings.accountHolder,
        iban: settings.iban,
        bankName: settings.bankName,
        note: settings.note,
        deadlineHours: settings.deadlineHours,
      },
    };
  }

  /**
   * hostId verilmişse ev sahibi görünümü: misafir onaylanana kadar (CONFIRMED
   * olana kadar) ad/e‑posta/telefon gizlenir. Kapora ödenmeden host misafire
   * platform dışından ulaşıp komisyonu atlayamasın diye — bkz. proje planı.
   */
  private response(
    booking: BookingRecord | (BookingRecord & { requestHash: string }),
    hostId?: string,
  ) {
    const { requestHash: _requestHash, ...safeBooking } = booking as BookingRecord & {
      requestHash?: string;
    };
    const revealContact = revealGuestContact(hostId, booking.status);
    return {
      ...safeBooking,
      checkIn: formatCalendarDate(booking.checkIn),
      checkOut: formatCalendarDate(booking.checkOut),
      customerName: revealContact ? safeBooking.customerName : null,
      customerEmail: revealContact ? safeBooking.customerEmail : null,
      customerPhone: revealContact ? safeBooking.customerPhone : null,
    };
  }
}
