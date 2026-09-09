import { Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtGuard } from '../auth/jwt.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { FavoritesService } from './favorites.service';

/** Favoriler müşteri deneyiminin parçasıdır; yalnızca GUEST hesabına açıktır. */
@Controller('favorites')
@UseGuards(JwtGuard, RolesGuard)
@Roles('GUEST')
export class FavoritesController {
  constructor(private favorites: FavoritesService) {}

  @Get()
  list(@Req() req: Request & { user: { sub: string } }) {
    return this.favorites.list(req.user.sub);
  }

  @Post(':villaId')
  add(@Param('villaId') villaId: string, @Req() req: Request & { user: { sub: string } }) {
    return this.favorites.add(req.user.sub, villaId);
  }

  @Delete(':villaId')
  remove(@Param('villaId') villaId: string, @Req() req: Request & { user: { sub: string } }) {
    return this.favorites.remove(req.user.sub, villaId);
  }
}
