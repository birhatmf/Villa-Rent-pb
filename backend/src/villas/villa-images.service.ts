import { BadRequestException, Injectable, NotFoundException, PayloadTooLargeException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { existsSync } from 'fs';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { join } from 'path';
import { PrismaService } from '../prisma.service';
import { assertUploadSignature } from '../security/upload-signature';
import { UPLOAD_ROOT, VillasService } from './villas.service';

const ALLOWED_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
};
export const MAX_IMAGE_SIZE = 15 * 1024 * 1024; // 15 MB
export const MAX_IMAGES_PER_VILLA = 60;
export const MAX_IMAGE_BYTES_PER_VILLA = 300 * 1024 * 1024;

@Injectable()
export class VillaImagesService {
  constructor(
    private prisma: PrismaService,
    private villas: VillasService,
    private config: ConfigService,
  ) {}

  /** Görseller herkese açık servis edilir (host-application belgelerinin aksine) — pazarlama fotoğrafı. */
  async add(
    villaId: string,
    category: string,
    file: Express.Multer.File,
    dims: { width?: number; height?: number },
    hostId?: string,
  ) {
    const ext = ALLOWED_MIME[file.mimetype];
    if (!ext) throw new BadRequestException('Yalnızca JPG veya PNG dosyası yükleyebilirsiniz.');
    if (file.size > MAX_IMAGE_SIZE) throw new BadRequestException('Dosya boyutu 15 MB’ı aşamaz.');
    assertUploadSignature(file.buffer, file.mimetype, ['image/jpeg', 'image/png']);

    const dir = join(UPLOAD_ROOT, villaId);
    if (!existsSync(dir)) await mkdir(dir, { recursive: true });

    const storedName = `${randomUUID()}${ext}`;
    const storedPath = join(dir, storedName);
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Villa" WHERE id = ${villaId} FOR UPDATE`;
        const villa = await tx.villa.findFirst({
          where: { id: villaId, ...(hostId ? { hostId } : {}) },
          select: { id: true, status: true },
        });
        if (!villa) throw new NotFoundException('Villa bulunamadı.');

        const usage = await tx.villaImage.aggregate({
          where: { villaId },
          _count: { _all: true },
          _sum: { size: true },
        });
        assertUploadQuota(
          usage._count._all,
          usage._sum.size ?? 0,
          file.size,
          MAX_IMAGES_PER_VILLA,
          MAX_IMAGE_BYTES_PER_VILLA,
          'Villa görsel kotası aşıldı.',
        );

        await writeFile(storedPath, file.buffer, { flag: 'wx' });
        const image = await tx.villaImage.create({
          data: {
            villaId,
            category: category as any,
            url: `${this.publicUrl()}/uploads/villas/${villaId}/${storedName}`,
            storedName,
            fileName: file.originalname.slice(0, 200),
            mimeType: file.mimetype,
            size: file.size,
            width: dims.width,
            height: dims.height,
            order: usage._count._all,
            isCover: usage._count._all === 0,
          },
        });
        if (hostId && villa.status === 'PUBLISHED') {
          await this.markPendingReview(tx, villaId, hostId, 'Owner ilana yeni fotoğraf ekledi.');
        }
        return image;
      });
    } catch (error) {
      await unlink(storedPath).catch(() => {});
      throw error;
    }
  }

  async reorderOrCover(villaId: string, imageId: string, data: { order?: number; isCover?: boolean }, hostId?: string) {
    await this.villas.getScoped(villaId, hostId);
    const image = await this.assertImage(villaId, imageId);

    if (data.isCover) {
      await this.prisma.villaImage.updateMany({ where: { villaId }, data: { isCover: false } });
    }
    return this.prisma.villaImage.update({
      where: { id: image.id },
      data: {
        ...(data.order !== undefined ? { order: data.order } : {}),
        ...(data.isCover !== undefined ? { isCover: data.isCover } : {}),
      },
    });
  }

  async remove(villaId: string, imageId: string, hostId?: string) {
    const image = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Villa" WHERE id = ${villaId} FOR UPDATE`;
      const villa = await tx.villa.findFirst({
        where: { id: villaId, ...(hostId ? { hostId } : {}) },
        select: { id: true, status: true },
      });
      if (!villa) throw new NotFoundException('Villa bulunamadı.');
      const scopedImage = await tx.villaImage.findFirst({ where: { id: imageId, villaId } });
      if (!scopedImage) throw new NotFoundException('Görsel bulunamadı.');
      await tx.villaImage.delete({ where: { id: scopedImage.id } });
      if (hostId && villa.status === 'PUBLISHED') {
        await this.markPendingReview(tx, villaId, hostId, 'Owner ilandan fotoğraf kaldırdı.');
      }
      return scopedImage;
    });
    if (image.storedName) {
      await unlink(join(UPLOAD_ROOT, villaId, image.storedName)).catch(() => {});
    }
    return { ok: true };
  }

  private async assertImage(villaId: string, imageId: string) {
    const image = await this.prisma.villaImage.findUnique({ where: { id: imageId } });
    if (!image || image.villaId !== villaId) throw new NotFoundException('Görsel bulunamadı.');
    return image;
  }

  private async markPendingReview(tx: any, villaId: string, actorId: string, reason: string) {
    await tx.villa.update({
      where: { id: villaId },
      data: { status: 'PENDING_REVIEW', reviewedAt: null, reviewedBy: null, reviewNote: null },
    });
    await tx.calendarAudit.create({
      data: {
        villaId,
        actorId,
        entityType: 'VILLA',
        entityId: villaId,
        action: 'VILLA_STATUS_CHANGED',
        reason,
        before: { status: 'PUBLISHED' },
        after: { status: 'PENDING_REVIEW' },
      },
    });
  }

  private publicUrl() {
    return (this.config.get<string>('PUBLIC_URL') ?? 'http://localhost:4000').replace(/\/$/, '');
  }
}

export function assertUploadQuota(
  count: number,
  bytes: number,
  incomingBytes: number,
  maxFiles: number,
  maxBytes: number,
  message: string,
) {
  if (count >= maxFiles || bytes + incomingBytes > maxBytes) {
    throw new PayloadTooLargeException(message);
  }
}
