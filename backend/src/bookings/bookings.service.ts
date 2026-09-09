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
import type { AdminCreateBookingDto, ChangeBookingDto, CreateHoldDto, OwnBookingListDto, ResolveServiceRequestDto, UpdateRefundDto } from './dto';
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

  async createHold(input: CreateHoldDto, userId: string | null, idempotencyKey?: string) {
    const key = this.idempotencyKey(idempotencyKey);
    const anonymous = userId ? null : this.anonymousContact(input);
    const owner = userId ? `guest:${userId}` : `anonymous:${this.hash(anonymous!.email)}`;
    const normalized = this.normalizeStay(input);
    const requestHash = this.hash({ villaId: input.villaId, ...normalized, ...(anonymous ? { customer: anonymous } : {}) });
    // Ayarlar kilit ALTINDA okunmaz: açık transaction içinden ikinci bir sorgu
    // havuzdan yeni bağlantı ister ve eşzamanlı bekletmelerde kilitlenme yaratır.
    const payment = readPaymentSettings(await this.settings.get('payments'));

    try {
      return await this.occupancy.withVillaLock(input.villaId, async (tx, now) => {
        const existing = await this.findIdempotent(tx, owner, key, requestHash);
        if (existing) return this.response(existing);

        let customer: { name: string; email: string; phone: string | null };
        if (userId) {
          const guest = await tx.$queryRaw<{ id: string; name: string; email: string; phone: string | null }[]>`
            SELECT id, name, email, phone FROM "User" WHERE id = ${userId} AND active = true FOR UPDATE
          `;
          if (!guest.length) throw new ForbiddenException('Aktif misafir hesabı bulunamadı.');
          customer = guest[0];
        } else {
          customer = anonymous!;
        }
        const activeHolds = await tx.booking.count({
          where: {
            guestId: userId,
            ...(!userId ? { customerEmail: customer.email } : {}),
            status: 'HOLD',
            holdExpiresAt: { gt: now },
          },
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
            guestId: userId ?? undefined,
            status: 'HOLD',
            channel: 'WEBSITE',
            checkIn: dates.checkIn,
            checkOut: dates.checkOut,
            ...normalized,
            // İletişim bilgisi boşsa hesaptaki bilgi yazılır; misafir hesabını
            // sonradan değiştirse de rezervasyonun kimin adına açıldığı sabit kalır.
            customerName: input.customerName?.trim() || customer.name,
            customerEmail: input.customerEmail?.trim().toLowerCase() || customer.email,
            customerPhone: input.customerPhone?.trim() || customer.phone || undefined,
            ...quote,
            priceSnapshot: this.snapshot(quote.priceSnapshot),
            paymentStatus: 'PENDING',
            prepaymentAmount: prepaymentFor(quote.totalAmount, payment, villa.commissionRate),
            holdExpiresAt: new Date(now.getTime() + HOLD_MINUTES * 60_000),
            idempotencyOwner: owner,
            idempotencyKey: key,
            requestHash,
          },
          select: BOOKING_SELECT,
        });
        await this.audit(tx, booking, userId ?? undefined, 'HOLD_CREATED', undefined, {
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

  /**
   * Talep modundaki (veya dış takvimi doğrulanamayan) villa için REQUESTED
   * rezervasyon açar. Stok kilitlemez: aynı gecelere birden çok talep düşebilir,
   * host/admin kabul ederken villa kilidi altında müsaitlik tekrar kontrol edilir
   * (bkz. acceptRequest). REQUESTED kayıtlar stok sayılmadığı için aynı tarih için
   * birden fazla talep alınabilir. SYNC_UNHEALTHY talebi engellemez; mevcut kesin
   * rezervasyon/blok ile çakışma ve villa kuralı ihlalleri (kapasite, min gece, giriş günü, satış
   * durdurulmuş) hâlâ engeller.
   */
  async createRequest(input: CreateHoldDto, userId: string | null, idempotencyKey?: string) {
    const key = this.idempotencyKey(idempotencyKey);
    const anonymous = userId ? null : this.anonymousContact(input);
    const owner = userId ? `guest:${userId}` : `anonymous:${this.hash(anonymous!.email)}`;
    const normalized = this.normalizeStay(input);
    const requestHash = this.hash({ villaId: input.villaId, ...normalized, kind: 'REQUEST', ...(anonymous ? { customer: anonymous } : {}) });

    try {
      return await this.occupancy.withVillaLock(input.villaId, async (tx, now) => {
        const existing = await this.findIdempotent(tx, owner, key, requestHash);
        if (existing) return this.response(existing);

        let customer: { name: string; email: string; phone: string | null };
        if (userId) {
          const guest = await tx.$queryRaw<{ id: string; name: string; email: string; phone: string | null }[]>`
            SELECT id, name, email, phone FROM "User" WHERE id = ${userId} AND active = true FOR UPDATE
          `;
          if (!guest.length) throw new ForbiddenException('Aktif misafir hesabı bulunamadı.');
          customer = guest[0];
        } else {
          customer = anonymous!;
        }

        const dates = parseStayDates(input.from, input.to);
        const { villa, result } = await this.occupancy.checkAvailability(tx, input.villaId, dates, normalized);
        if (villa.bookingMode !== 'REQUEST' && !result.reasons.includes('SYNC_UNHEALTHY')) {
          throw new ConflictException('Bu villa doğrudan rezervasyona açıktır; rezervasyon talebi oluşturulamaz.');
        }
        const blocking = result.reasons.filter((r) => r !== 'SYNC_UNHEALTHY');
        this.assertAvailable(blocking);

        const quote = this.occupancy.quote(villa, dates);
        const booking = await tx.booking.create({
          data: {
            villaId: input.villaId,
            guestId: userId ?? undefined,
            status: 'REQUESTED',
            channel: 'WEBSITE',
            checkIn: dates.checkIn,
            checkOut: dates.checkOut,
            ...normalized,
            customerName: input.customerName?.trim() || customer.name,
            customerEmail: input.customerEmail?.trim().toLowerCase() || customer.email,
            customerPhone: input.customerPhone?.trim() || customer.phone || undefined,
            ...quote,
            priceSnapshot: this.snapshot(quote.priceSnapshot),
            paymentStatus: 'NONE',
            prepaymentAmount: 0,
            idempotencyOwner: owner,
            idempotencyKey: key,
            requestHash,
          },
          select: BOOKING_SELECT,
        });
        await this.audit(tx, booking, userId ?? undefined, 'REQUEST_CREATED', undefined, {
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

  /** Host/admin bir talebi kabul eder: müsaitlik villa kilidi altında tekrar kontrol edilir, uygunsa HOLD'a döner. */
  async acceptRequest(id: string, actorId: string, hostId?: string) {
    const target = await this.bookingTarget(id, hostId);
    const payment = readPaymentSettings(await this.settings.get('payments'));
    return this.occupancy.withVillaLock(target.villaId, async (tx, now) => {
      const booking = await tx.booking.findUnique({ where: { id }, select: BOOKING_SELECT });
      if (!booking) throw new NotFoundException('Rezervasyon bulunamadı.');
      if (booking.status !== 'REQUESTED') throw new ConflictException('Bu talep artık kabul edilemez.');

      const dates = { checkIn: booking.checkIn, checkOut: booking.checkOut, nights: this.nights(booking) };
      const { villa, result } = await this.occupancy.checkAvailability(
        tx,
        booking.villaId,
        dates,
        { adults: booking.adults, children: booking.children, infants: booking.infants },
        booking.id,
      );
      if (result.reasons.length) {
        // Aynı geceler bu sırada satılmış: talep otomatik reddedilir, ikinci rezervasyon
        // yaratılmaz. Hata fırlatmıyoruz — transaction içinde throw, az önce yazdığımız
        // DECLINED güncellemesini de geri alır. Bunun yerine sonucu normal döndürüyoruz;
        // admin ekranı booking.status === 'DECLINED' görüp nedeni cancellationNote'tan okur.
        const declined = await tx.booking.update({
          where: { id },
          data: { status: 'DECLINED', cancelledAt: now, cancellationNote: 'Tarihler artık müsait değil.', version: { increment: 1 } },
          select: BOOKING_SELECT,
        });
        await this.audit(tx, declined, actorId, 'REQUEST_DECLINED', { status: booking.status }, { status: declined.status, reasons: result.reasons }, 'Tarihler artık müsait değil.');
        return this.response(declined, hostId);
      }

      const quote = this.occupancy.quote(villa, dates);
      const updated = await tx.booking.update({
        where: { id },
        data: {
          status: 'HOLD',
          ...quote,
          priceSnapshot: this.snapshot(quote.priceSnapshot, booking.priceSnapshot),
          paymentStatus: 'PENDING',
          prepaymentAmount: prepaymentFor(quote.totalAmount, payment, villa.commissionRate),
          holdExpiresAt: new Date(now.getTime() + HOLD_MINUTES * 60_000),
          version: { increment: 1 },
        },
        select: BOOKING_SELECT,
      });
      await this.audit(tx, updated, actorId, 'REQUEST_ACCEPTED', { status: booking.status }, {
        status: updated.status,
        holdExpiresAt: updated.holdExpiresAt?.toISOString(),
      });
      return this.response(updated, hostId);
    });
  }

  /** Host/admin bir talebi doğrudan reddeder (stok çakışması değil, tercih). */
  async declineRequest(id: string, actorId: string, note: string, hostId?: string) {
    const target = await this.bookingTarget(id, hostId);
    return this.occupancy.withVillaLock(target.villaId, async (tx, now) => {
      const booking = await tx.booking.findUnique({ where: { id }, select: BOOKING_SELECT });
      if (!booking) throw new NotFoundException('Rezervasyon bulunamadı.');
      if (booking.status !== 'REQUESTED') throw new ConflictException('Bu talep artık reddedilemez.');
      const updated = await tx.booking.update({
        where: { id },
        data: { status: 'DECLINED', cancelledAt: now, cancellationNote: note.trim(), version: { increment: 1 } },
        select: BOOKING_SELECT,
      });
      await this.audit(tx, updated, actorId, 'REQUEST_DECLINED', { status: booking.status }, { status: updated.status }, note.trim());
      return this.response(updated, hostId);
    });
  }

  /** Misafir kendi bekleyen talebini geri çeker. */
  async withdrawRequest(id: string, userId: string) {
    const target = await this.prisma.booking.findFirst({ where: { id, guestId: userId }, select: { villaId: true } });
    if (!target) throw new NotFoundException('Rezervasyon bulunamadı.');
    return this.occupancy.withVillaLock(target.villaId, async (tx, now) => {
      const booking = await tx.booking.findFirst({ where: { id, guestId: userId }, select: BOOKING_SELECT });
      if (!booking) throw new NotFoundException('Rezervasyon bulunamadı.');
      if (booking.status === 'WITHDRAWN' || booking.status === 'DECLINED') return this.response(booking);
      if (booking.status !== 'REQUESTED') throw new ForbiddenException('Yalnızca bekleyen bir talep geri çekilebilir.');
      const updated = await tx.booking.update({
        where: { id },
        data: { status: 'WITHDRAWN', cancelledAt: now, cancellationNote: 'Misafir talebi geri çekti.', version: { increment: 1 } },
        select: BOOKING_SELECT,
      });
      await this.audit(tx, updated, userId, 'REQUEST_WITHDRAWN', { status: booking.status }, { status: updated.status }, 'Misafir talebi geri çekti.');
      return this.response(updated);
    });
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
            priceSnapshot: this.snapshot(quote.priceSnapshot),
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
          priceSnapshot: this.snapshot(quote.priceSnapshot, booking.priceSnapshot),
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
      await tx.bookingServiceRequest.updateMany({
        where: { bookingId: id, status: 'PENDING' },
        data: { status: 'REJECTED', resolutionNote: 'Rezervasyon iptal edildi.', resolvedAt: now, resolvedBy: actorId, version: { increment: 1 } },
      });
      return this.response(updated, hostId);
    });
  }

  /**
   * Onaylı rezervasyonu customer doğrudan değiştiremez/iptal edemez —
   * BookingServiceRequest üzerinden talep açar, admin/host sonuçlandırır (bkz.
   * resolveServiceRequest). Aynı rezervasyon+tür için tek aktif PENDING kaydı
   * DB'deki kısmi unique index'le korunur (20260908_service_requests.sql).
   */
  async requestChange(
    bookingId: string,
    userId: string,
    payload: { from: string; to: string; adults: number; children?: number; infants?: number },
    customerNote: string | undefined,
  ) {
    return this.createServiceRequest(bookingId, userId, 'CHANGE', customerNote, {
      from: payload.from,
      to: payload.to,
      adults: payload.adults,
      children: payload.children ?? 0,
      infants: payload.infants ?? 0,
    }, 'guest');
  }

  async previewOwnChange(
    bookingId: string,
    userId: string,
    payload: { from: string; to: string; adults: number; children?: number; infants?: number },
  ) {
    const target = await this.prisma.booking.findFirst({ where: { id: bookingId, guestId: userId }, select: { villaId: true, status: true } });
    if (!target) throw new NotFoundException('Rezervasyon bulunamadı.');
    if (target.status !== 'CONFIRMED') throw new ConflictException('Yalnızca onaylanmış rezervasyonlar için değişiklik önizlenebilir.');
    const dates = parseStayDates(payload.from, payload.to);
    const guests = this.normalizeStay(payload);
    const payment = readPaymentSettings(await this.settings.get('payments'));
    return this.occupancy.withVillaLock(target.villaId, async (tx) => {
      const { villa, result } = await this.occupancy.checkAvailability(tx, target.villaId, dates, guests, bookingId);
      const quote = this.occupancy.quote(villa, dates);
      return { ...result, from: payload.from, to: payload.to, quote: { ...quote, prepaymentAmount: prepaymentFor(quote.totalAmount, payment, villa.commissionRate) } };
    });
  }

  /** Misafir kendi onaylı rezervasyonu için iptal talebi bırakır. */
  async requestCancellationByGuest(bookingId: string, userId: string, note: string) {
    return this.createServiceRequest(bookingId, userId, 'CANCELLATION', note, undefined, 'guest');
  }

  /**
   * Ev sahibi kendi villasının onaylı rezervasyonu için iptal talebi bırakır.
   * Kapora platformun parası olduğu için owner rezervasyonu doğrudan iptal edemez
   * (bkz. cancel()) — talep admin'e gider (bkz. resolveServiceRequest).
   */
  async requestCancellationByHost(bookingId: string, hostId: string, note: string) {
    return this.createServiceRequest(bookingId, hostId, 'CANCELLATION', note, undefined, 'host');
  }

  private async createServiceRequest(
    bookingId: string,
    requestedBy: string,
    type: 'CHANGE' | 'CANCELLATION',
    customerNote: string | undefined,
    payload: { from: string; to: string; adults: number; children: number; infants: number } | undefined,
    scope: 'guest' | 'host',
  ) {
    const target = await this.prisma.booking.findFirst({
      where: { id: bookingId, ...(scope === 'guest' ? { guestId: requestedBy } : { villa: { hostId: requestedBy } }) },
      select: { villaId: true },
    });
    if (!target) throw new NotFoundException('Rezervasyon bulunamadı.');
    try {
      return await this.occupancy.withVillaLock(target.villaId, async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Booking" WHERE id = ${bookingId} FOR UPDATE`;
        const booking = await tx.booking.findFirst({
          where: { id: bookingId, ...(scope === 'guest' ? { guestId: requestedBy } : { villa: { hostId: requestedBy } }) },
          select: { id: true, villaId: true, status: true },
        });
        if (!booking) throw new NotFoundException('Rezervasyon bulunamadı.');
        if (booking.status !== 'CONFIRMED') throw new ConflictException('Yalnızca onaylanmış rezervasyonlar için talep bırakılabilir.');

        let requestPayload: Prisma.InputJsonValue | undefined;
        if (type === 'CHANGE' && payload) {
          const dates = parseStayDates(payload.from, payload.to);
          const { villa, result } = await this.occupancy.checkAvailability(tx, booking.villaId, dates, payload, booking.id);
          this.assertAvailable(result.reasons);
          const quote = this.occupancy.quote(villa, dates);
          requestPayload = { ...payload, preview: { totalAmount: quote.totalAmount, currency: quote.currency } };
        }

        const request = await tx.bookingServiceRequest.create({
          data: { bookingId, requestedBy, type, payload: requestPayload, customerNote: customerNote?.trim() },
        });
        await this.audit(tx, booking, requestedBy, type === 'CHANGE' ? 'CHANGE_REQUESTED' : 'CANCELLATION_REQUESTED', undefined, type === 'CHANGE' ? requestPayload as Prisma.InputJsonObject : undefined, customerNote?.trim());
        return request;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(
          type === 'CHANGE'
            ? 'Bu rezervasyon için zaten bekleyen bir değişiklik talebi var.'
            : 'Bu rezervasyon için zaten bekleyen bir iptal talebi var.',
        );
      }
      throw error;
    }
  }

  /** Talebi açan taraf (misafir veya host) bekleyen talebini geri çeker. */
  async withdrawServiceRequest(requestId: string, userId: string) {
    const target = await this.prisma.bookingServiceRequest.findFirst({ where: { id: requestId, requestedBy: userId }, select: { booking: { select: { villaId: true } } } });
    if (!target) throw new NotFoundException('Talep bulunamadı.');
    return this.occupancy.withVillaLock(target.booking.villaId, async (tx, now) => {
      const request = await tx.bookingServiceRequest.findFirst({ where: { id: requestId, requestedBy: userId } });
      if (!request) throw new NotFoundException('Talep bulunamadı.');
      if (request.status !== 'PENDING') return request;
      const updated = await tx.bookingServiceRequest.update({ where: { id: requestId }, data: { status: 'WITHDRAWN', resolvedAt: now, version: { increment: 1 } } });
      await tx.calendarAudit.create({ data: { villaId: target.booking.villaId, actorId: userId, entityType: 'BOOKING', entityId: request.bookingId, action: 'SERVICE_REQUEST_WITHDRAWN' } });
      return updated;
    });
  }

  /**
   * Admin (CANCELLATION için tek yetkili) veya host (yalnızca CHANGE) bir talebi
   * sonuçlandırır. Talep satırı, rezervasyon ve villa aynı transaction içinde
   * kilitlenir; rezervasyon değişimiyle talep kararı birbirinden ayrı kalamaz.
   */
  async resolveServiceRequest(
    requestId: string,
    input: ResolveServiceRequestDto,
    actorId: string,
    hostId?: string,
  ) {
    const target = await this.prisma.bookingServiceRequest.findUnique({
      where: { id: requestId },
      include: { booking: { select: { villaId: true, villa: { select: { hostId: true } } } } },
    });
    if (!target || (hostId && target.booking.villa.hostId !== hostId)) throw new NotFoundException('Talep bulunamadı.');
    const payment = readPaymentSettings(await this.settings.get('payments'));
    return this.occupancy.withVillaLock(target.booking.villaId, async (tx, now) => {
      await tx.$queryRaw`SELECT id FROM "BookingServiceRequest" WHERE id = ${requestId} FOR UPDATE`;
      const request = await tx.bookingServiceRequest.findUnique({ where: { id: requestId }, include: { booking: { select: BOOKING_SELECT } } });
      if (!request) throw new NotFoundException('Talep bulunamadı.');
      if (hostId && !(await tx.villa.count({ where: { id: request.booking.villaId, hostId } }))) throw new NotFoundException('Talep bulunamadı.');
      if (request.status !== 'PENDING') throw new ConflictException('Bu talep zaten sonuçlandırılmış.');
      if (request.type === 'CANCELLATION' && hostId) throw new ForbiddenException('İptal talebini yalnızca yönetici sonuçlandırabilir.');

      if (input.decision === 'REJECTED') {
        const updated = await tx.bookingServiceRequest.update({ where: { id: requestId }, data: { status: 'REJECTED', resolutionNote: input.resolutionNote?.trim(), resolvedAt: now, resolvedBy: actorId, version: { increment: 1 } } });
        await this.audit(tx, request.booking, actorId, request.type === 'CHANGE' ? 'CHANGE_REQUEST_REJECTED' : 'CANCELLATION_REQUEST_REJECTED', undefined, undefined, input.resolutionNote?.trim());
        return updated;
      }

      if (request.booking.status !== 'CONFIRMED') throw new ConflictException('Rezervasyon artık bu taleple değiştirilemez.');
      if (request.type === 'CANCELLATION') {
        const refundAmount = input.refundAmount ?? (request.booking.paymentStatus === 'PAID' ? request.booking.prepaymentAmount : 0);
        if (refundAmount > request.booking.prepaymentAmount) throw new BadRequestException('İade tutarı alınan kaporayı aşamaz.');
        const cancelled = await tx.booking.update({ where: { id: request.bookingId }, data: { status: 'CANCELLED', cancelledAt: now, cancellationNote: input.resolutionNote?.trim() || 'İptal talebi onaylandı.', version: { increment: 1 } }, select: BOOKING_SELECT });
        await this.audit(tx, cancelled, actorId, 'BOOKING_CANCELLED', { status: 'CONFIRMED' }, { status: 'CANCELLED' }, cancelled.cancellationNote ?? undefined);
        await tx.bookingServiceRequest.updateMany({ where: { bookingId: request.bookingId, status: 'PENDING', id: { not: requestId } }, data: { status: 'REJECTED', resolutionNote: 'Rezervasyon iptal edildi.', resolvedAt: now, resolvedBy: actorId, version: { increment: 1 } } });
        return tx.bookingServiceRequest.update({
          where: { id: requestId },
          data: { status: 'APPROVED', resolutionNote: input.resolutionNote?.trim(), resolvedAt: now, resolvedBy: actorId, refundStatus: refundAmount > 0 ? input.refundStatus ?? 'PENDING' : 'NONE', refundAmount, refundNote: input.refundNote?.trim(), refundUpdatedAt: refundAmount > 0 ? now : null, version: { increment: 1 } },
        });
      }

      const payload = request.payload as { from: string; to: string; adults: number; children: number; infants: number };
      const dates = parseStayDates(payload.from, payload.to);
      const { villa, result } = await this.occupancy.checkAvailability(tx, request.booking.villaId, dates, payload, request.bookingId);
      this.assertAvailable(result.reasons);
      const quote = this.occupancy.quote(villa, dates);
      const changed = await tx.booking.update({
        where: { id: request.bookingId },
        data: {
          checkIn: dates.checkIn,
          checkOut: dates.checkOut,
          adults: payload.adults,
          children: payload.children,
          infants: payload.infants,
          ...quote,
          priceSnapshot: this.snapshot(quote.priceSnapshot, request.booking.priceSnapshot),
          // PAID gerçek tahsilatı ifade eder; yeni fiyat yüzünden alınmamış bir
          // kaporayı ödenmiş göstermemek için yalnızca açık ödeme tutarı yenilenir.
          prepaymentAmount:
            request.booking.paymentStatus === 'PENDING' || request.booking.paymentStatus === 'DECLARED'
              ? prepaymentFor(quote.totalAmount, payment, villa.commissionRate)
              : request.booking.prepaymentAmount,
          version: { increment: 1 },
        },
        select: BOOKING_SELECT,
      });
      await this.audit(tx, changed, actorId, 'BOOKING_CHANGED', { checkIn: formatCalendarDate(request.booking.checkIn), checkOut: formatCalendarDate(request.booking.checkOut), totalAmount: request.booking.totalAmount }, { checkIn: formatCalendarDate(changed.checkIn), checkOut: formatCalendarDate(changed.checkOut), totalAmount: changed.totalAmount });
      return tx.bookingServiceRequest.update({ where: { id: requestId }, data: { status: 'APPROVED', resolutionNote: input.resolutionNote?.trim(), resolvedAt: now, resolvedBy: actorId, version: { increment: 1 } } });
    });
  }

  async updateServiceRequestRefund(requestId: string, input: UpdateRefundDto, actorId: string) {
    const target = await this.prisma.bookingServiceRequest.findUnique({ where: { id: requestId }, select: { booking: { select: { villaId: true } } } });
    if (!target) throw new NotFoundException('Talep bulunamadı.');
    return this.occupancy.withVillaLock(target.booking.villaId, async (tx, now) => {
      const request = await tx.bookingServiceRequest.findUnique({ where: { id: requestId }, include: { booking: { select: { prepaymentAmount: true } } } });
      if (!request || request.type !== 'CANCELLATION' || request.status !== 'APPROVED') throw new ConflictException('Yalnızca onaylanmış iptal talebinin iadesi güncellenebilir.');
      if (input.amount > request.booking.prepaymentAmount) throw new BadRequestException('İade tutarı alınan kaporayı aşamaz.');
      const updated = await tx.bookingServiceRequest.update({ where: { id: requestId }, data: { refundStatus: input.status, refundAmount: input.amount, refundNote: input.note?.trim(), refundUpdatedAt: now, version: { increment: 1 } } });
      await tx.calendarAudit.create({ data: { villaId: target.booking.villaId, actorId, entityType: 'BOOKING', entityId: request.bookingId, action: 'REFUND_UPDATED', reason: input.note?.trim(), after: { status: input.status, amount: input.amount } } });
      return updated;
    });
  }

  async releaseOwnHold(id: string, userId: string) {
    return this.releaseHold(id, userId);
  }

  async releaseGuestHold(id: string) {
    return this.releaseHold(id, null);
  }

  private async releaseHold(id: string, userId: string | null) {
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
      await this.audit(tx, updated, userId ?? undefined, 'HOLD_RELEASED', { status: booking.status }, {
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
  async declarePayment(id: string, userId: string | null) {
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
      await this.audit(tx, updated, userId ?? undefined, 'PAYMENT_DECLARED', {
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
    const serviceRequests = await this.prisma.bookingServiceRequest.findMany({ where: { bookingId: id }, orderBy: { createdAt: 'desc' } });
    return { ...this.ownResponse(booking, readPaymentSettings(await this.settings.get('payments'))), serviceRequests };
  }

  async getGuest(id: string) {
    const booking = await this.prisma.booking.findFirst({ where: { id, guestId: null }, select: BOOKING_SELECT });
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
        ? { OR: [{ status: 'HOLD', paymentStatus: 'PENDING', holdExpiresAt: { gt: new Date() } }, { status: 'REQUESTED' }] }
        : scope === 'upcoming'
          ? { status: 'CONFIRMED', checkOut: { gt: today } }
          : scope === 'past'
            ? { status: 'CONFIRMED', checkOut: { lte: today } }
            : scope === 'cancelled'
              ? { status: { in: ['CANCELLED', 'EXPIRED', 'DECLINED', 'WITHDRAWN'] } }
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
    const serviceRequests = await this.prisma.bookingServiceRequest.findMany({
      where: { bookingId: id },
      include: { requester: { select: { name: true, role: true } } },
      orderBy: { createdAt: 'desc' },
    });
    const safeServiceRequests = !revealGuestContact(hostId, booking.status)
      ? serviceRequests.map((request) => ({ ...request, requester: request.requester.role === 'GUEST' ? { ...request.requester, name: 'Misafir' } : request.requester }))
      : serviceRequests;
    return { ...this.response(booking, hostId), audits: safeAudits, serviceRequests: safeServiceRequests };
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

  private anonymousContact(input: CreateHoldDto) {
    const name = input.customerName?.trim();
    const email = input.customerEmail?.trim().toLowerCase();
    const phone = input.customerPhone?.trim();
    if (!name || !email || !phone) {
      throw new BadRequestException('Üyesiz rezervasyon için ad soyad, e‑posta ve telefon zorunludur.');
    }
    return { name, email, phone };
  }

  private snapshot(priceSnapshot: object, existing?: Prisma.JsonValue) {
    const previous = existing && typeof existing === 'object' && !Array.isArray(existing)
      ? (existing as Prisma.JsonObject).cancellationPolicy
      : undefined;
    return {
      ...priceSnapshot,
      cancellationPolicy: previous ?? {
        version: 'manual-review-v1',
        text: 'İptal ve kapora iadesi yönetim incelemesine tabidir.',
        refundMethod: 'MANUAL_REVIEW',
      },
    } as Prisma.InputJsonValue;
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
    actorId: string | undefined,
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
