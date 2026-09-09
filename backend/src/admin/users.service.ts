import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma.service';

/** passwordHash hiçbir yanıtta dönmesin diye tek yerden seçiyoruz. */
const SAFE = {
  id: true,
  email: true,
  name: true,
  phone: true,
  role: true,
  active: true,
  marketingOptIn: true,
  kvkkAcceptedAt: true,
  lastLoginAt: true,
  createdAt: true,
} as const;

export type ListParams = {
  q?: string;
  role?: Role;
  active?: boolean;
  page?: number;
  pageSize?: number;
};

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async list({ q, role, active, page = 1, pageSize = 20 }: ListParams) {
    const take = Math.min(Math.max(pageSize, 1), 100);
    const skip = (Math.max(page, 1) - 1) * take;

    const where: Prisma.UserWhereInput = {
      ...(role ? { role } : {}),
      ...(active === undefined ? {} : { active }),
      ...(q?.trim()
        ? {
            OR: [
              { name: { contains: q.trim(), mode: 'insensitive' } },
              { email: { contains: q.trim(), mode: 'insensitive' } },
              { phone: { contains: q.trim(), mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: SAFE,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.user.count({ where }),
    ]);

    return { items, total, page: Math.max(page, 1), pageSize: take };
  }

  async get(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: SAFE });
    if (!user) throw new NotFoundException('Üye bulunamadı.');
    return user;
  }

  async update(id: string, data: { role?: Role; active?: boolean }, actorId: string) {
    if (data.role === undefined && data.active === undefined) {
      throw new BadRequestException('Değiştirilecek bir alan gönderin.');
    }
    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "User" WHERE id = ${id} FOR UPDATE`;
      if (!locked.length) throw new NotFoundException('Üye bulunamadı.');
      const target = await tx.user.findUniqueOrThrow({
        where: { id },
        select: { role: true, active: true, _count: { select: { villas: true } } },
      });

      // Kilitlenme koruması: yönetici kendi yetkisini düşüremez / kendini engelleyemez.
      if (id === actorId) {
        if (data.role && data.role !== 'ADMIN') {
          throw new BadRequestException('Kendi yönetici yetkinizi kaldıramazsınız.');
        }
        if (data.active === false) {
          throw new BadRequestException('Kendi hesabınızı engelleyemezsiniz.');
        }
      }
      if (data.role === 'HOST' && target.role !== 'HOST') {
        throw new BadRequestException('Ev sahibi rolü yalnızca onaylanan ev sahibi başvurusuyla verilir.');
      }
      if (target.role === 'HOST' && data.role && data.role !== 'HOST') {
        throw new BadRequestException('Ev sahibi hesabının rolü değiştirilemez; gerekirse hesabı pasifleştirin.');
      }
      if (data.role === 'ADMIN' && target.role !== 'ADMIN') {
        const ownerApplication = await tx.hostApplication.findFirst({
          where: { linkedHostId: id, status: { in: ['PENDING', 'APPROVED'] } },
          select: { id: true },
        });
        if (ownerApplication) {
          throw new BadRequestException('Aktif ev sahibi başvurusu olan hesap yönetici yapılamaz.');
        }
      }
      const removesAdmin = target.role === 'ADMIN' && target.active && ((data.role && data.role !== 'ADMIN') || data.active === false);
      if (removesAdmin) {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('my_villa_active_admin'))`;
        if (await this.isLastActiveAdmin(id, tx)) {
          throw new BadRequestException('Son aktif yönetici hesabının yetkisi kaldırılamaz.');
        }
      }
      return tx.user.update({ where: { id }, data: { ...data, sessionVersion: { increment: 1 } }, select: SAFE });
    });
  }

  async remove(id: string, actorId: string) {
    if (id === actorId) throw new BadRequestException('Kendi hesabınızı silemezsiniz.');
    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "User" WHERE id = ${id} FOR UPDATE`;
      if (!locked.length) throw new NotFoundException('Üye bulunamadı.');
      const target = await tx.user.findUniqueOrThrow({
        where: { id },
        select: { role: true, active: true, _count: { select: { villas: true, bookings: true, reviews: true } } },
      });
      if (target._count.villas || target._count.bookings || target._count.reviews) {
        throw new BadRequestException('Operasyon kaydı olan hesap silinemez; hesabı pasifleştirin.');
      }
      if (target.role === 'ADMIN' && target.active) {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('my_villa_active_admin'))`;
        if (await this.isLastActiveAdmin(id, tx)) {
          throw new BadRequestException('Son aktif yönetici hesabı silinemez.');
        }
      }
      await tx.user.delete({ where: { id } });
      return { ok: true };
    });
  }

  private async isLastActiveAdmin(excludedId: string, tx: Prisma.TransactionClient) {
    return (await tx.user.count({
      where: { id: { not: excludedId }, role: 'ADMIN', active: true },
    })) === 0;
  }

  counts() {
    return this.prisma.user.count();
  }
}
