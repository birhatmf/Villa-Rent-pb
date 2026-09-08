import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type ReviewStatus } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { formatCalendarDate } from '../villas/availability';
import type { AdminReviewListDto, ReviewBodyDto, ReviewListDto } from './dto';
import { reviewEligibility } from './eligibility';

const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

const REVIEW_INCLUDE = {
  villa: { select: { title: true, slug: true, hostId: true } },
  guest: { select: { name: true } },
  response: { select: { body: true, createdAt: true, updatedAt: true } },
} as const;

@Injectable()
export class ReviewsService {
  constructor(private prisma: PrismaService) {}

  async listPublic(slug: string, input: ReviewListDto) {
    const villa = await this.prisma.villa.findFirst({ where: { slug, status: 'PUBLISHED' }, select: { id: true } });
    if (!villa) throw new NotFoundException('Villa bulunamadı.');
    const { page, pageSize } = this.page(input);
    const where = { villaId: villa.id, status: 'PUBLISHED' as ReviewStatus };
    const [items, total, grouped] = await this.prisma.$transaction([
      this.prisma.review.findMany({ where, include: REVIEW_INCLUDE, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.review.count({ where }),
      this.prisma.review.groupBy({ by: ['rating'], where, _count: { rating: true }, orderBy: { rating: 'desc' } }),
    ]);
    const counts = new Map(
      (grouped as Array<{ rating: number; _count: { rating: number } }>).map((row) => [row.rating, row._count.rating]),
    );
    const distribution = [5, 4, 3, 2, 1].map((rating) => ({ rating, count: counts.get(rating) ?? 0 }));
    return { items: items.map((item) => this.publicResponse(item)), total, page, pageSize, distribution };
  }

  async listEligible(userId: string) {
    const bookings = await this.prisma.booking.findMany({
      where: { guestId: userId, status: 'CONFIRMED', paymentStatus: { in: ['PAID', 'NONE'] }, review: null, villa: { hostId: { not: userId } } },
      select: { id: true, status: true, paymentStatus: true, checkIn: true, checkOut: true, villa: { select: { title: true, slug: true, timezone: true, checkOutTime: true } } },
      orderBy: { checkOut: 'desc' },
      take: 100,
    });
    const now = new Date();
    return bookings.filter((booking) => this.isEligible(booking, now)).map((booking) => ({
      bookingId: booking.id,
      checkIn: formatCalendarDate(booking.checkIn),
      checkOut: formatCalendarDate(booking.checkOut),
      villa: { title: booking.villa.title, slug: booking.villa.slug },
    }));
  }

  async listMine(userId: string, input: ReviewListDto) {
    const { page, pageSize } = this.page(input);
    const where = { guestId: userId };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.review.findMany({ where, include: REVIEW_INCLUDE, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.review.count({ where }),
    ]);
    return { items: items.map((item) => this.ownResponse(item)), total, page, pageSize };
  }

  async create(bookingId: string, userId: string, input: ReviewBodyDto) {
    const body = this.reviewBody(input.body);
    const target = await this.prisma.booking.findFirst({ where: { id: bookingId, guestId: userId }, select: { villaId: true } });
    if (!target) throw new NotFoundException('Rezervasyon bulunamadı.');
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.lockVilla(tx, target.villaId);
        await tx.$queryRaw`SELECT id FROM "Booking" WHERE id = ${bookingId} FOR UPDATE`;
        const booking = await tx.booking.findFirst({
          where: { id: bookingId, guestId: userId },
          select: { id: true, villaId: true, status: true, paymentStatus: true, checkIn: true, checkOut: true, review: { select: { id: true } }, villa: { select: { title: true, slug: true, hostId: true, timezone: true, checkOutTime: true } } },
        });
        if (!booking) throw new NotFoundException('Rezervasyon bulunamadı.');
        if (booking.review) throw new ConflictException('Bu konaklama için yorum zaten gönderilmiş.');
        if (booking.villa.hostId === userId) throw new ForbiddenException('Kendi villanız için yorum bırakamazsınız.');
        this.assertEligible(booking, new Date());
        const review = await tx.review.create({ data: { bookingId, villaId: booking.villaId, guestId: userId, rating: input.rating, body }, include: REVIEW_INCLUDE });
        await this.recalculate(tx, booking.villaId);
        await this.audit(tx, review.id, booking.villaId, userId, 'REVIEW_CREATED', undefined, { rating: review.rating, status: review.status });
        return this.ownResponse(review);
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Bu konaklama için yorum zaten gönderilmiş.');
      }
      throw error;
    }
  }

  async update(id: string, userId: string, input: ReviewBodyDto) {
    const body = this.reviewBody(input.body);
    const target = await this.prisma.review.findFirst({ where: { id, guestId: userId }, select: { villaId: true } });
    if (!target) throw new NotFoundException('Yorum bulunamadı.');
    return this.prisma.$transaction(async (tx) => {
      await this.lockVilla(tx, target.villaId);
      const review = await tx.review.findFirst({ where: { id, guestId: userId }, include: REVIEW_INCLUDE });
      if (!review) throw new NotFoundException('Yorum bulunamadı.');
      if (Date.now() - review.createdAt.getTime() > EDIT_WINDOW_MS) throw new ForbiddenException('Yorum yalnızca ilk 24 saat içinde düzenlenebilir.');
      const updated = await tx.review.update({ where: { id }, data: { rating: input.rating, body }, include: REVIEW_INCLUDE });
      await this.recalculate(tx, review.villaId);
      await this.audit(tx, id, review.villaId, userId, 'REVIEW_UPDATED', { rating: review.rating }, { rating: updated.rating });
      return this.ownResponse(updated);
    });
  }

  async listHost(hostId: string, input: ReviewListDto) {
    const { page, pageSize } = this.page(input);
    const where = { villa: { hostId }, status: 'PUBLISHED' as ReviewStatus };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.review.findMany({ where, include: REVIEW_INCLUDE, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.review.count({ where }),
    ]);
    return { items: items.map((item) => this.publicResponse(item, true)), total, page, pageSize };
  }

  async respond(id: string, hostId: string, body: string) {
    const cleanBody = body.trim();
    if (cleanBody.length < 2) throw new BadRequestException('Yanıt en az 2 karakter olmalıdır.');
    const target = await this.prisma.review.findFirst({ where: { id, villa: { hostId }, status: 'PUBLISHED' }, select: { villaId: true } });
    if (!target) throw new NotFoundException('Yorum bulunamadı.');
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.lockVilla(tx, target.villaId);
        const review = await tx.review.findFirst({ where: { id, villa: { hostId }, status: 'PUBLISHED' }, include: REVIEW_INCLUDE });
        if (!review) throw new NotFoundException('Yorum bulunamadı.');
        if (review.response) throw new ConflictException('Bu yoruma zaten yanıt verilmiş.');
        const response = await tx.reviewResponse.create({ data: { reviewId: id, responderId: hostId, body: cleanBody }, select: { body: true, createdAt: true, updatedAt: true } });
        await this.audit(tx, id, review.villaId, hostId, 'REVIEW_RESPONDED');
        return response;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('Bu yoruma zaten yanıt verilmiş.');
      throw error;
    }
  }

  async listAdmin(input: AdminReviewListDto) {
    const { page, pageSize } = this.page(input);
    const where = input.status ? { status: input.status as ReviewStatus } : {};
    const [items, total] = await this.prisma.$transaction([
      this.prisma.review.findMany({ where, include: REVIEW_INCLUDE, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.review.count({ where }),
    ]);
    return { items: items.map((item) => ({ ...this.ownResponse(item), guestName: item.guest.name })), total, page, pageSize };
  }

  async moderate(id: string, actorId: string, input: { status: 'PUBLISHED' | 'HIDDEN'; reason?: string }) {
    if (input.status === 'HIDDEN' && !input.reason?.trim()) throw new BadRequestException('Yorumu gizlemek için gerekçe zorunludur.');
    const target = await this.prisma.review.findUnique({ where: { id }, select: { villaId: true } });
    if (!target) throw new NotFoundException('Yorum bulunamadı.');
    return this.prisma.$transaction(async (tx) => {
      await this.lockVilla(tx, target.villaId);
      const review = await tx.review.findUnique({ where: { id }, include: REVIEW_INCLUDE });
      if (!review) throw new NotFoundException('Yorum bulunamadı.');
      const updated = await tx.review.update({
        where: { id },
        data: { status: input.status, moderationReason: input.status === 'HIDDEN' ? input.reason!.trim() : null, moderatedAt: new Date(), moderatedBy: actorId },
        include: REVIEW_INCLUDE,
      });
      await this.recalculate(tx, review.villaId);
      await this.audit(tx, id, review.villaId, actorId, 'REVIEW_MODERATED', { status: review.status }, { status: updated.status }, updated.moderationReason ?? undefined);
      return { ...this.ownResponse(updated), guestName: updated.guest.name };
    });
  }

  private assertEligible(booking: { status: string; paymentStatus: string; checkOut: Date; villa: { timezone: string; checkOutTime: string } }, now: Date) {
    let result: ReturnType<typeof reviewEligibility>;
    try { result = reviewEligibility(booking, now); }
    catch { throw new BadRequestException('Villanın saat dilimi geçersiz.'); }
    if (result === 'NOT_CONFIRMED') throw new ConflictException('Yalnızca onaylanmış konaklamalar değerlendirilebilir.');
    if (result === 'NOT_PAID') throw new ConflictException('Ödemesi doğrulanmamış konaklama değerlendirilemez.');
    if (result === 'TOO_EARLY') throw new ConflictException('Yorum konaklamanın çıkış saatinden sonra yapılabilir.');
    if (result === 'TOO_LATE') throw new ConflictException('Yorum süresi sona ermiş.');
  }

  private isEligible(booking: { status?: string; paymentStatus?: string; checkOut: Date; villa: { timezone: string; checkOutTime: string } }, now: Date) {
    try { this.assertEligible({ status: booking.status ?? 'CONFIRMED', paymentStatus: booking.paymentStatus ?? 'PAID', checkOut: booking.checkOut, villa: booking.villa }, now); return true; } catch { return false; }
  }

  private async lockVilla(tx: Prisma.TransactionClient, villaId: string) {
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Villa" WHERE id = ${villaId} FOR UPDATE`;
    if (!rows.length) throw new NotFoundException('Villa bulunamadı.');
  }

  private async recalculate(tx: Prisma.TransactionClient, villaId: string) {
    const aggregate = await tx.review.aggregate({ where: { villaId, status: 'PUBLISHED' }, _avg: { rating: true }, _count: { _all: true } });
    await tx.villa.update({ where: { id: villaId }, data: { rating: aggregate._avg.rating ?? 0, reviewCount: aggregate._count._all } });
  }

  private audit(tx: Prisma.TransactionClient, id: string, villaId: string, actorId: string, action: string, before?: Prisma.InputJsonValue, after?: Prisma.InputJsonValue, reason?: string) {
    return tx.calendarAudit.create({ data: { villaId, actorId, entityType: 'REVIEW', entityId: id, action, before, after, reason } });
  }

  private page(input: ReviewListDto) {
    return { page: Math.max(input.page ?? 1, 1), pageSize: Math.min(Math.max(input.pageSize ?? 12, 1), 50) };
  }

  private reviewBody(body: string) {
    const clean = body.trim();
    if (clean.length < 10) throw new BadRequestException('Yorum en az 10 karakter olmalıdır.');
    return clean;
  }

  private publicResponse(review: Prisma.ReviewGetPayload<{ include: typeof REVIEW_INCLUDE }>, includeId = false) {
    const names = review.guest.name.trim().split(/\s+/);
    return {
      ...(includeId ? { id: review.id } : {}),
      rating: review.rating,
      body: review.body,
      guestName: names.length > 1 ? `${names[0]} ${names.at(-1)![0]}.` : names[0],
      verifiedStay: true,
      createdAt: review.createdAt,
      villa: { title: review.villa.title, slug: review.villa.slug },
      response: review.response,
    };
  }

  private ownResponse(review: Prisma.ReviewGetPayload<{ include: typeof REVIEW_INCLUDE }>) {
    return {
      id: review.id,
      bookingId: review.bookingId,
      rating: review.rating,
      body: review.body,
      status: review.status,
      moderationReason: review.moderationReason,
      canEdit: Date.now() - review.createdAt.getTime() <= EDIT_WINDOW_MS,
      createdAt: review.createdAt,
      updatedAt: review.updatedAt,
      villa: { title: review.villa.title, slug: review.villa.slug },
      response: review.response,
    };
  }
}
