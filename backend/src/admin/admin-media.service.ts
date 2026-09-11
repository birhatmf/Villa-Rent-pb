import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { assertUploadSignature } from '../security/upload-signature';

const TYPES: Record<string, { extension: string }> = {
  'image/jpeg': { extension: '.jpg' },
  'image/png': { extension: '.png' },
  'image/webp': { extension: '.webp' },
};

export const MAX_CONTENT_IMAGE_SIZE = 15 * 1024 * 1024;

@Injectable()
export class AdminMediaService {
  constructor(private config: ConfigService) {}

  async uploadImage(file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('Görsel dosyası zorunlu.');
    if (file.size > MAX_CONTENT_IMAGE_SIZE) throw new BadRequestException('Dosya boyutu 15 MB’ı aşamaz.');

    const type = TYPES[file.mimetype];
    if (!type) {
      throw new BadRequestException('Yalnızca geçerli JPG, PNG veya WebP görsel yükleyebilirsiniz.');
    }
    assertUploadSignature(file.buffer, file.mimetype, ['image/jpeg', 'image/png', 'image/webp']);

    const now = new Date();
    const year = String(now.getUTCFullYear());
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const directory = join(process.cwd(), 'uploads', 'media', year, month);
    const storedName = `${randomUUID()}${type.extension}`;
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, storedName), file.buffer, { flag: 'wx' });

    const publicUrl = (this.config.get<string>('PUBLIC_URL') ?? 'http://localhost:4000').replace(/\/$/, '');
    return {
      url: `${publicUrl}/uploads/media/${year}/${month}/${storedName}`,
      fileName: file.originalname.slice(0, 200),
      mimeType: file.mimetype,
      size: file.size,
    };
  }
}
