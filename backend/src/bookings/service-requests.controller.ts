import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtGuard } from '../auth/jwt.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { BookingsService } from './bookings.service';
import { ResolveServiceRequestDto, UpdateRefundDto } from './dto';

type AuthRequest = Request & { user: { sub: string } };

/**
 * Onaylı rezervasyon için açılan değişiklik/iptal taleplerinin sonuçlandırılması.
 * CANCELLATION yalnızca admin'de (kapora platformun parası — bkz.
 * BookingsService.resolveServiceRequest), CHANGE admin veya host'ta.
 */
@Controller('admin/service-requests')
@UseGuards(JwtGuard, RolesGuard)
@Roles('ADMIN')
export class AdminServiceRequestsController {
  constructor(private bookings: BookingsService) {}

  @Post(':id/resolve')
  resolve(@Param('id') id: string, @Body() dto: ResolveServiceRequestDto, @Req() req: AuthRequest) {
    return this.bookings.resolveServiceRequest(id, dto, req.user.sub);
  }

  @Post(':id/refund')
  refund(@Param('id') id: string, @Body() dto: UpdateRefundDto, @Req() req: AuthRequest) {
    return this.bookings.updateServiceRequestRefund(id, dto, req.user.sub);
  }
}

@Controller('host/service-requests')
@UseGuards(JwtGuard, RolesGuard)
@Roles('HOST', 'ADMIN')
export class HostServiceRequestsController {
  constructor(private bookings: BookingsService) {}

  @Post(':id/resolve')
  resolve(@Param('id') id: string, @Body() dto: ResolveServiceRequestDto, @Req() req: AuthRequest) {
    return this.bookings.resolveServiceRequest(id, dto, req.user.sub, req.user.sub);
  }
}
