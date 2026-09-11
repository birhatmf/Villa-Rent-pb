import { Controller, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtGuard } from '../auth/jwt.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { AdminMediaService, MAX_CONTENT_IMAGE_SIZE } from './admin-media.service';

@Controller('admin/media')
@UseGuards(JwtGuard, RolesGuard)
@Roles('ADMIN')
export class AdminMediaController {
  constructor(private media: AdminMediaService) {}

  @Post('images')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_CONTENT_IMAGE_SIZE, files: 1, fields: 0, parts: 1 },
    }),
  )
  uploadImage(@UploadedFile() file?: Express.Multer.File) {
    return this.media.uploadImage(file);
  }
}
