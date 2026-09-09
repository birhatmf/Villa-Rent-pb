import { Controller, Delete, Get, Headers, Param, Post, Body, Query, Req, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import { JwtGuard } from '../auth/jwt.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { BookingsService } from './bookings.service';
import { CancellationRequestDto, CreateHoldDto, OwnBookingListDto, RequestChangeDto } from './dto';

type AuthRequest = Request & { user: { sub: string } };

@Controller('bookings')
@UseGuards(JwtGuard, RolesGuard, ThrottlerGuard)
@Roles('GUEST')
export class BookingsController {
  constructor(private bookings: BookingsService) {}

  @Post('holds')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  createHold(
    @Body() dto: CreateHoldDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() req: AuthRequest,
  ) {
    return this.bookings.createHold(dto, req.user.sub, idempotencyKey);
  }

  @Post('requests')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  createRequest(
    @Body() dto: CreateHoldDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() req: AuthRequest,
  ) {
    return this.bookings.createRequest(dto, req.user.sub, idempotencyKey);
  }

  @Post('service-requests/:requestId/withdraw')
  withdrawServiceRequest(@Param('requestId') requestId: string, @Req() req: AuthRequest) {
    return this.bookings.withdrawServiceRequest(requestId, req.user.sub);
  }

  @Get()
  list(@Query() query: OwnBookingListDto, @Req() req: AuthRequest) {
    return this.bookings.listOwn(req.user.sub, query);
  }

  @Get(':id')
  get(@Param('id') id: string, @Req() req: AuthRequest) {
    return this.bookings.getOwn(id, req.user.sub);
  }

  @Post(':id/payment-declared')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  declarePayment(@Param('id') id: string, @Req() req: AuthRequest) {
    return this.bookings.declarePayment(id, req.user.sub);
  }

  @Delete(':id/hold')
  releaseHold(@Param('id') id: string, @Req() req: AuthRequest) {
    return this.bookings.releaseOwnHold(id, req.user.sub);
  }

  @Post(':id/withdraw')
  withdrawRequest(@Param('id') id: string, @Req() req: AuthRequest) {
    return this.bookings.withdrawRequest(id, req.user.sub);
  }

  @Post(':id/change-request')
  requestChange(@Param('id') id: string, @Body() dto: RequestChangeDto, @Req() req: AuthRequest) {
    return this.bookings.requestChange(id, req.user.sub, dto, dto.customerNote);
  }

  @Post(':id/change-preview')
  previewChange(@Param('id') id: string, @Body() dto: RequestChangeDto, @Req() req: AuthRequest) {
    return this.bookings.previewOwnChange(id, req.user.sub, dto);
  }

  @Post(':id/cancellation-request')
  requestCancellation(@Param('id') id: string, @Body() dto: CancellationRequestDto, @Req() req: AuthRequest) {
    return this.bookings.requestCancellationByGuest(id, req.user.sub, dto.reason);
  }
}
