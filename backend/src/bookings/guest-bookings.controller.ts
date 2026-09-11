import { Body, Controller, Delete, Get, Headers, NotFoundException, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Throttle } from '@nestjs/throttler';
import { IsEmail, IsString, Length } from 'class-validator';
import type { Request, Response } from 'express';
import { StayDto } from './dto';
import { BookingsService } from './bookings.service';

class GuestBookingDto extends StayDto {
  @IsString() villaId!: string;
  @IsString() @Length(2, 100) customerName!: string;
  @IsEmail() customerEmail!: string;
  @IsString() @Length(5, 30) customerPhone!: string;
}

const cookieName = (id: string) => `mv_guest_booking_${id}`;
const COOKIE_BASE = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
};
const GUEST_ACCESS_DAYS = 30;

@Controller('guest-bookings')
export class GuestBookingsController {
  constructor(
    private bookings: BookingsService,
    private jwt: JwtService,
  ) {}

  @Post('holds')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async createHold(
    @Body() dto: GuestBookingDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const booking = await this.bookings.createHold(dto, null, idempotencyKey);
    await this.grant(booking.id, res);
    return booking;
  }

  @Post('requests')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async createRequest(
    @Body() dto: GuestBookingDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const booking = await this.bookings.createRequest(dto, null, idempotencyKey);
    await this.grant(booking.id, res);
    return booking;
  }

  @Get(':id')
  async get(@Param('id') id: string, @Req() req: Request) {
    await this.authorize(id, req);
    return this.bookings.getGuest(id);
  }

  @Post(':id/payment-declared')
  async declarePayment(@Param('id') id: string, @Req() req: Request) {
    await this.authorize(id, req);
    return this.bookings.declarePayment(id, null);
  }

  @Delete(':id/hold')
  async releaseHold(
    @Param('id') id: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authorize(id, req);
    const result = await this.bookings.releaseGuestHold(id);
    res.clearCookie(cookieName(id), { ...COOKIE_BASE, path: `/api/guest-bookings/${id}` });
    return result;
  }

  private async grant(bookingId: string, res: Response) {
    const guestAccessVersion = await this.bookings.guestCapabilityVersion(bookingId);
    const token = await this.jwt.signAsync(
      { kind: 'guest-booking', bookingId, guestAccessVersion },
      { expiresIn: `${GUEST_ACCESS_DAYS}d` },
    );
    res.cookie(cookieName(bookingId), token, {
      ...COOKIE_BASE,
      maxAge: GUEST_ACCESS_DAYS * 24 * 60 * 60 * 1000,
      path: `/api/guest-bookings/${bookingId}`,
    });
  }

  private async authorize(bookingId: string, req: Request) {
    try {
      const payload = await this.jwt.verifyAsync<{ kind: string; bookingId: string; guestAccessVersion: number }>(
        req.cookies?.[cookieName(bookingId)],
      );
      if (payload.kind !== 'guest-booking' || payload.bookingId !== bookingId) throw new Error('invalid');
      if (!Number.isInteger(payload.guestAccessVersion)) throw new Error('invalid');
      if (!(await this.bookings.hasGuestCapability(bookingId, payload.guestAccessVersion))) throw new Error('revoked');
    } catch {
      throw new NotFoundException('Rezervasyon bulunamadı.');
    }
  }
}
