import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Req, Res, UseGuards } from '@nestjs/common';
import { IsBoolean, IsInt, IsOptional, IsString, IsUrl, Length, MaxLength, Min } from 'class-validator';
import type { Request, Response } from 'express';
import { JwtGuard } from '../auth/jwt.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { IcalService } from './ical.service';

type AuthRequest = Request & { user: { sub: string } };

class IcalPreviewDto {
  @IsString() @IsUrl({ protocols: ['https'], require_protocol: true }) @MaxLength(2000) url!: string;
}

class IcalCreateDto extends IcalPreviewDto {
  @IsString() @Length(2, 80) label!: string;
  @IsOptional() @IsBoolean() required?: boolean;
}

class IcalPauseDto {
  @IsBoolean() paused!: boolean;
  @IsInt() @Min(0) version!: number;
}

class IcalRemoveDto {
  @IsInt() @Min(0) version!: number;
  @IsOptional() @IsBoolean() releaseBlocks?: boolean;
  @IsString() @Length(2, 300) reason!: string;
}

@Controller('admin/villas/:villaId/ical-sources')
@UseGuards(JwtGuard, RolesGuard)
@Roles('ADMIN')
export class AdminIcalController {
  constructor(private ical: IcalService) {}

  @Get()
  list(@Param('villaId') villaId: string) {
    return this.ical.list(villaId);
  }

  @Post('preview')
  preview(@Param('villaId') villaId: string, @Body() dto: IcalPreviewDto) {
    return this.ical.preview(villaId, dto.url);
  }

  @Post()
  create(@Param('villaId') villaId: string, @Body() dto: IcalCreateDto, @Req() req: AuthRequest) {
    return this.ical.create(villaId, dto, req.user.sub);
  }

  @Post(':sourceId/sync')
  sync(@Param('villaId') villaId: string, @Param('sourceId') sourceId: string) {
    return this.ical.syncScoped(villaId, sourceId);
  }

  @Patch(':sourceId/pause')
  pause(
    @Param('villaId') villaId: string,
    @Param('sourceId') sourceId: string,
    @Body() dto: IcalPauseDto,
    @Req() req: AuthRequest,
  ) {
    return this.ical.setPaused(villaId, sourceId, dto.paused, dto.version, req.user.sub);
  }

  @Delete(':sourceId')
  remove(
    @Param('villaId') villaId: string,
    @Param('sourceId') sourceId: string,
    @Body() dto: IcalRemoveDto,
    @Req() req: AuthRequest,
  ) {
    return this.ical.remove(villaId, sourceId, dto, req.user.sub);
  }

  @Post('export-token/rotate')
  rotate(@Param('villaId') villaId: string, @Req() req: AuthRequest) {
    return this.ical.rotateExportToken(villaId, req.user.sub);
  }
}

@Controller('host/villas/:villaId/ical-sources')
@UseGuards(JwtGuard, RolesGuard)
@Roles('HOST', 'ADMIN')
export class HostIcalController {
  constructor(private ical: IcalService) {}

  @Get()
  list(@Param('villaId') villaId: string, @Req() req: AuthRequest) {
    return this.ical.list(villaId, req.user.sub);
  }

  @Post('preview')
  preview(@Param('villaId') villaId: string, @Body() dto: IcalPreviewDto, @Req() req: AuthRequest) {
    return this.ical.preview(villaId, dto.url, req.user.sub);
  }

  @Post()
  create(@Param('villaId') villaId: string, @Body() dto: IcalCreateDto, @Req() req: AuthRequest) {
    return this.ical.create(villaId, dto, req.user.sub, req.user.sub);
  }

  @Post(':sourceId/sync')
  sync(@Param('villaId') villaId: string, @Param('sourceId') sourceId: string, @Req() req: AuthRequest) {
    return this.ical.syncScoped(villaId, sourceId, req.user.sub);
  }

  @Patch(':sourceId/pause')
  pause(
    @Param('villaId') villaId: string,
    @Param('sourceId') sourceId: string,
    @Body() dto: IcalPauseDto,
    @Req() req: AuthRequest,
  ) {
    return this.ical.setPaused(villaId, sourceId, dto.paused, dto.version, req.user.sub, req.user.sub);
  }

  @Delete(':sourceId')
  remove(
    @Param('villaId') villaId: string,
    @Param('sourceId') sourceId: string,
    @Body() dto: IcalRemoveDto,
    @Req() req: AuthRequest,
  ) {
    return this.ical.remove(villaId, sourceId, dto, req.user.sub, req.user.sub);
  }

  @Post('export-token/rotate')
  rotate(@Param('villaId') villaId: string, @Req() req: AuthRequest) {
    return this.ical.rotateExportToken(villaId, req.user.sub, req.user.sub);
  }
}

@Controller('calendar')
export class PublicIcalController {
  constructor(private ical: IcalService) {}

  @Get(':token.ics')
  async export(
    @Param('token') token: string,
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Res() response: Response,
  ) {
    const calendar = await this.ical.exportCalendar(token);
    response.setHeader('ETag', calendar.etag);
    response.setHeader('Cache-Control', 'private, max-age=300');
    if (ifNoneMatch === calendar.etag) return response.status(304).end();
    response.type('text/calendar; charset=utf-8');
    return response.send(calendar.body);
  }
}
