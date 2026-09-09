import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';

const TYPES: Record<string, { extension: string; valid: (buffer: Buffer) => boolean }> = {
  'image/jpeg': {
    extension: '.jpg',
    valid: (buffer) => buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff,
  },
  'image/png': {
    extension: '.png',
    valid: (buffer) => buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  'image/webp': {
    extension: '.webp',
    valid: (buffer) =>
      buffer.length >= 12 &&
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP',
  },
};

export const MAX_CONTENT_IMAGE_SIZE = 15 * 1024 * 1024;

@Injectable()
export class AdminMediaService {
  constructor(private config: ConfigService) {}

  async uploadImage(file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('Görsel dosyası zorunlu.');
    if (file.size > MAX_CONTENT_IMAGE_SIZE) throw new BadRequestException('Dosya boyutu 15 MB’ı aşamaz.');

    const type = TYPES[file.mimetype];
    if (!type || !type.valid(file.buffer)) {
      throw new BadRequestException('Yalnızca geçerli JPG, PNG veya WebP görsel yükleyebilirsiniz.');
    }

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
