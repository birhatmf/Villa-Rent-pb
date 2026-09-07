import { Body, Controller, Get, Headers, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { BookingChannel, BookingStatus } from '@prisma/client';
import type { Request } from 'express';
import { JwtGuard } from '../auth/jwt.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { BookingsService } from './bookings.service';
import {
  AdminCreateBookingDto,
  BookingListDto,
  BookingVersionDto,
  CancelBookingDto,
  ChangeBookingDto,
} from './dto';

type AuthRequest = Request & { user: { sub: string } };

@Controller('admin/bookings')
@UseGuards(JwtGuard, RolesGuard)
@Roles('ADMIN')
export class AdminBookingsController {
  constructor(private bookings: BookingsService) {}

  @Get()
  list(@Query() query: BookingListDto) {
    return this.bookings.listAdmin({
      ...query,
      status: query.status as BookingStatus | undefined,
      channel: query.channel as BookingChannel | undefined,
    });
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.bookings.getAdmin(id);
  }

  @Post()
  create(
    @Body() dto: AdminCreateBookingDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() req: AuthRequest,
  ) {
    return this.bookings.createConfirmed(dto, req.user.sub, idempotencyKey);
  }

  @Post(':id/confirm')
  confirm(@Param('id') id: string, @Body() dto: BookingVersionDto, @Req() req: AuthRequest) {
    return this.bookings.confirm(id, dto.version, req.user.sub);
  }

  @Patch(':id')
  change(@Param('id') id: string, @Body() dto: ChangeBookingDto, @Req() req: AuthRequest) {
    return this.bookings.change(id, dto, req.user.sub);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string, @Body() dto: CancelBookingDto, @Req() req: AuthRequest) {
    return this.bookings.cancel(id, dto.version, dto.note, req.user.sub);
  }
}

/**
 * Ev sahibi kendi villalarının rezervasyonlarını görür ve onaylayabilir.
 * Misafir iletişim bilgisi (ad/e‑posta/telefon) rezervasyon CONFIRMED olana
 * kadar gizlenir — bkz. BookingsService.response. Admin de bu uçlara erişebilir
 * (destek için) ama host/villas ile aynı kuralla kendi kullanıcı id'si üzerinden
 * çalışır; başka host'un rezervasyonlarını görmek için admin/bookings kullanılır.
 */
@Controller('host/bookings')
@UseGuards(JwtGuard, RolesGuard)
@Roles('HOST', 'ADMIN')
export class HostBookingsController {
  constructor(private bookings: BookingsService) {}

  @Get()
  list(@Query() query: BookingListDto, @Req() req: AuthRequest) {
    return this.bookings.listAdmin({
      ...query,
      status: query.status as BookingStatus | undefined,
      channel: query.channel as BookingChannel | undefined,
      hostId: req.user.sub,
    });
  }

  @Get(':id')
  get(@Param('id') id: string, @Req() req: AuthRequest) {
    return this.bookings.getAdmin(id, req.user.sub);
  }

  @Post(':id/confirm')
  confirm(@Param('id') id: string, @Body() dto: BookingVersionDto, @Req() req: AuthRequest) {
    return this.bookings.confirm(id, dto.version, req.user.sub, req.user.sub);
  }

  @Patch(':id')
  change(@Param('id') id: string, @Body() dto: ChangeBookingDto, @Req() req: AuthRequest) {
    return this.bookings.change(id, dto, req.user.sub, req.user.sub);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string, @Body() dto: CancelBookingDto, @Req() req: AuthRequest) {
    return this.bookings.cancel(id, dto.version, dto.note, req.user.sub, req.user.sub);
  }
}
