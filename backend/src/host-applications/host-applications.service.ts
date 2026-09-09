import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type ApplicationStatus, type DocumentType, type OwnershipType } from '@prisma/client';
import { randomUUID } from 'crypto';
import { existsSync } from 'fs';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { extname, join } from 'path';
import { PrismaService } from '../prisma.service';

export const UPLOAD_ROOT = join(process.cwd(), 'uploads', 'host-applications');

const ALLOWED_MIME: Record<string, string> = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
};
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export type CreateApplicationInput = {
  ownerName: string;
  ownerIdNumber: string;
  uetsAddress?: string;
  iban: string;
  address: string;
  parcelNo?: string;
  permitNumber?: string;
  maxCapacity?: number;
  kbsCode?: string;
  ownershipType: OwnershipType;
  signatureName: string;
};

export type ListParams = {
  status?: ApplicationStatus;
  q?: string;
  page?: number;
  pageSize?: number;
};

@Injectable()
export class HostApplicationsService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, input: CreateApplicationInput) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, phone: true, role: true, active: true },
    });
    if (!user?.active || user.role !== 'GUEST') {
      throw new BadRequestException('Ev sahibi başvurusu yalnızca müşteri hesabıyla yapılabilir.');
    }
    if (!user.phone) {
      throw new BadRequestException('Başvuru için hesabınıza telefon numarası ekleyin.');
    }

    const current = await this.prisma.hostApplication.findFirst({
      where: { linkedHostId: user.id, status: { in: ['PENDING', 'APPROVED'] } },
      select: { id: true, status: true },
    });
    if (current) {
      throw new ConflictException(
        current.status === 'PENDING' ? 'İncelenmekte olan bir başvurunuz zaten var.' : 'Hesabınız için onaylanmış bir ev sahibi başvurusu zaten var.',
      );
    }

    try {
      return await this.prisma.hostApplication.create({
        data: {
          ...input,
          email: user.email,
          phone: user.phone,
          linkedHostId: user.id,
          termsAcceptedAt: new Date(),
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Aktif bir ev sahibi başvurunuz zaten var.');
      }
      throw error;
    }
  }

  async list({ status, q, page = 1, pageSize = 20 }: ListParams) {
    const take = Math.min(Math.max(pageSize, 1), 100);
    const skip = (Math.max(page, 1) - 1) * take;

    const where = {
      ...(status ? { status } : {}),
      ...(q?.trim()
        ? {
            OR: [
              { ownerName: { contains: q.trim(), mode: 'insensitive' as const } },
              { email: { contains: q.trim(), mode: 'insensitive' as const } },
              { phone: { contains: q.trim(), mode: 'insensitive' as const } },
              { address: { contains: q.trim(), mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.hostApplication.findMany({
        where,
        include: { _count: { select: { documents: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.hostApplication.count({ where }),
    ]);

    return { items, total, page: Math.max(page, 1), pageSize: take };
  }

  async get(id: string) {
    const app = await this.prisma.hostApplication.findUnique({
      where: { id },
      include: {
        documents: { orderBy: { uploadedAt: 'asc' } },
        linkedHost: { select: { id: true, name: true, email: true } },
      },
    });
    if (!app) throw new NotFoundException('Başvuru bulunamadı.');
    return app;
  }

  async review(id: string, status: 'APPROVED' | 'REJECTED', adminNote: string | undefined, actorId: string) {
    const application = await this.prisma.hostApplication.findUnique({
      where: { id },
      include: { linkedHost: { select: { id: true, name: true, email: true, role: true, active: true } } },
    });
    if (!application) throw new NotFoundException('Başvuru bulunamadı.');
    if (application.status !== 'PENDING') throw new ConflictException('Bu başvuru daha önce sonuçlandırılmış.');
    if (!application.linkedHost) {
      throw new BadRequestException('Bu eski başvuru kayıtlı bir hesaba bağlı değil; kullanıcı yeniden başvurmalı.');
    }
    if (!application.linkedHost.active || application.linkedHost.role !== 'GUEST') {
      throw new ConflictException('Başvuru hesabı aktif bir müşteri hesabı değil.');
    }

    await this.prisma.$transaction(async (tx) => {
      const reviewed = await tx.hostApplication.updateMany({
        where: { id, status: 'PENDING' },
        data: { status, adminNote, reviewedAt: new Date(), reviewedBy: actorId },
      });
      if (reviewed.count !== 1) throw new ConflictException('Bu başvuru başka bir yönetici tarafından sonuçlandırıldı.');

      if (status === 'APPROVED') {
        const promoted = await tx.user.updateMany({
          where: { id: application.linkedHost!.id, role: 'GUEST', active: true },
          data: { role: 'HOST', sessionVersion: { increment: 1 } },
        });
        if (promoted.count !== 1) throw new ConflictException('Başvuru hesabının rolü değişti; işlem tamamlanamadı.');
      }
    });

    return this.get(id);
  }

  counts() {
    return this.prisma.hostApplication.count({ where: { status: 'PENDING' } });
  }

  /** Owner'ın kendi bağlı başvurusu — salt okunur, dashboard'daki "başvuru bilgileri" kartı için. */
  async getForHost(hostId: string) {
    return this.prisma.hostApplication.findFirst({
      where: { linkedHostId: hostId },
      select: {
        iban: true,
        permitNumber: true,
        ownershipType: true,
        maxCapacity: true,
        address: true,
        reviewedAt: true,
      },
    });
  }

  /** Dosyayı diske yazar ve kaydını oluşturur. MIME + boyut kontrolü burada. */
  async addDocument(
    applicationId: string,
    type: DocumentType,
    file: Express.Multer.File,
    userId: string,
  ) {
    const application = await this.prisma.hostApplication.findFirst({
      where: { id: applicationId, linkedHostId: userId, status: 'PENDING' },
      select: { id: true },
    });
    if (!application) throw new NotFoundException('Başvuru bulunamadı.');
    if (!file) throw new BadRequestException('Yüklenecek dosyayı seçin.');

    const ext = ALLOWED_MIME[file.mimetype];
    if (!ext) {
      throw new BadRequestException('Yalnızca PDF, JPG veya PNG dosyası yükleyebilirsiniz.');
    }
    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestException('Dosya boyutu 10 MB’ı aşamaz.');
    }

    const dir = join(UPLOAD_ROOT, applicationId);
    if (!existsSync(dir)) await mkdir(dir, { recursive: true });

    // Rastgele ad: orijinal dosya adı (Türkçe karakter, path traversal riski) diske hiç yazılmaz.
    const storedName = `${randomUUID()}${ext}`;
    await writeFile(join(dir, storedName), file.buffer);

    return this.prisma.hostApplicationDocument.create({
      data: {
        applicationId,
        type,
        fileName: file.originalname.slice(0, 200),
        storedName,
        mimeType: file.mimetype,
        size: file.size,
      },
    });
  }

  async getDocumentFile(applicationId: string, documentId: string) {
    const doc = await this.prisma.hostApplicationDocument.findUnique({
      where: { id: documentId },
    });
    if (!doc || doc.applicationId !== applicationId) {
      throw new NotFoundException('Belge bulunamadı.');
    }
    return { doc, path: join(UPLOAD_ROOT, applicationId, doc.storedName) };
  }

  async removeDocument(applicationId: string, documentId: string) {
    const { doc, path } = await this.getDocumentFile(applicationId, documentId);
    await this.prisma.hostApplicationDocument.delete({ where: { id: doc.id } });
    await unlink(path).catch(() => {});
    return { ok: true };
  }
}
