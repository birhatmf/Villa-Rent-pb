import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class FavoritesService {
  constructor(private prisma: PrismaService) {}

  async list(userId: string) {
    const rows = await this.prisma.favorite.findMany({
      where: { userId, villa: { status: 'PUBLISHED', salesStatus: 'OPEN' } },
      orderBy: { createdAt: 'desc' },
      include: {
        villa: {
          select: {
            id: true,
            slug: true,
            title: true,
            currency: true,
            pricePerNight: true,
            region: { select: { name: true, slug: true } },
            images: { where: { isCover: true }, take: 1, select: { url: true } },
            priceRules: { select: { pricePerNight: true } },
          },
        },
      },
    });

    return rows.map(({ villa }) => {
      const prices = [villa.pricePerNight, ...villa.priceRules.map((r) => r.pricePerNight)];
      const { priceRules: _drop, ...rest } = villa;
      return { ...rest, priceRange: { min: Math.min(...prices), max: Math.max(...prices) } };
    });
  }

  async add(userId: string, villaId: string) {
    const villa = await this.prisma.villa.findFirst({
      where: { id: villaId, status: 'PUBLISHED', salesStatus: 'OPEN' },
      select: { id: true },
    });
    if (!villa) throw new NotFoundException('Villa bulunamadı.');

    // upsert: aynı villayı iki kez favoriye eklemek hataya değil no-op'a düşer.
    await this.prisma.favorite.upsert({
      where: { userId_villaId: { userId, villaId } },
      update: {},
      create: { userId, villaId },
    });
    return { ok: true };
  }

  async remove(userId: string, villaId: string) {
    await this.prisma.favorite.deleteMany({ where: { userId, villaId } });
    return { ok: true };
  }
}
