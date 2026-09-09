import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtGuard } from '../auth/jwt.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { AdminReviewListDto, ModerateReviewDto, ReviewBodyDto, ReviewListDto, ReviewResponseDto } from './dto';
import { ReviewsService } from './reviews.service';

type AuthRequest = Request & { user: { sub: string } };

@Controller('villas')
export class PublicReviewsController {
  constructor(private reviews: ReviewsService) {}

  @Get(':slug/reviews')
  list(@Param('slug') slug: string, @Query() query: ReviewListDto) {
    return this.reviews.listPublic(slug, query);
  }
}

@Controller('reviews')
@UseGuards(JwtGuard, RolesGuard)
@Roles('GUEST')
export class CustomerReviewsController {
  constructor(private reviews: ReviewsService) {}

  @Get('eligible')
  eligible(@Req() req: AuthRequest) {
    return this.reviews.listEligible(req.user.sub);
  }

  @Get('mine')
  mine(@Query() query: ReviewListDto, @Req() req: AuthRequest) {
    return this.reviews.listMine(req.user.sub, query);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: ReviewBodyDto, @Req() req: AuthRequest) {
    return this.reviews.update(id, req.user.sub, dto);
  }
}

@Controller('bookings')
@UseGuards(JwtGuard, RolesGuard)
@Roles('GUEST')
export class BookingReviewsController {
  constructor(private reviews: ReviewsService) {}

  @Post(':bookingId/review')
  create(@Param('bookingId') bookingId: string, @Body() dto: ReviewBodyDto, @Req() req: AuthRequest) {
    return this.reviews.create(bookingId, req.user.sub, dto);
  }
}

@Controller('host/reviews')
@UseGuards(JwtGuard, RolesGuard)
@Roles('HOST')
export class HostReviewsController {
  constructor(private reviews: ReviewsService) {}

  @Get()
  list(@Query() query: ReviewListDto, @Req() req: AuthRequest) {
    return this.reviews.listHost(req.user.sub, query);
  }

  @Post(':id/response')
  respond(@Param('id') id: string, @Body() dto: ReviewResponseDto, @Req() req: AuthRequest) {
    return this.reviews.respond(id, req.user.sub, dto.body);
  }
}

@Controller('admin/reviews')
@UseGuards(JwtGuard, RolesGuard)
@Roles('ADMIN')
export class AdminReviewsController {
  constructor(private reviews: ReviewsService) {}

  @Get()
  list(@Query() query: AdminReviewListDto) {
    return this.reviews.listAdmin(query);
  }

  @Patch(':id/moderation')
  moderate(@Param('id') id: string, @Body() dto: ModerateReviewDto, @Req() req: AuthRequest) {
    return this.reviews.moderate(id, req.user.sub, dto);
  }
}
