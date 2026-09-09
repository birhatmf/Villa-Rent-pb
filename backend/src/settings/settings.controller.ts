import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { IsObject } from 'class-validator';
import { JwtGuard } from '../auth/jwt.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { SettingsService } from './settings.service';

class SetSettingDto {
  @IsObject() value!: Record<string, any>;
}

/**
 * Halka açık ayarlar beyaz listeyle sınırlı. `payments` gibi anahtarlar komisyon
 * oranı ve IBAN taşır; bunlar yalnızca admin ucundan ve kendi rezervasyonunu
 * görüntüleyen misafirin rezervasyon yanıtından okunur.
 */
const PUBLIC_SETTING_KEYS = new Set(['footer', 'branding']);

@Controller('settings')
export class SettingsController {
  constructor(private settings: SettingsService) {}

  @Get(':key')
  get(@Param('key') key: string) {
    if (!PUBLIC_SETTING_KEYS.has(key)) return {};
    return this.settings.get(key);
  }
}

@Controller('admin/settings')
@UseGuards(JwtGuard, RolesGuard)
@Roles('ADMIN')
export class AdminSettingsController {
  constructor(private settings: SettingsService) {}

  @Get(':key')
  get(@Param('key') key: string) {
    return this.settings.get(key);
  }

  @Put(':key')
  set(@Param('key') key: string, @Body() dto: SetSettingDto) {
    return this.settings.set(key, dto.value);
  }
}
