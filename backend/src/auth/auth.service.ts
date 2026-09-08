import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma.service';

const SAFE_USER = {
  id: true,
  email: true,
  name: true,
  phone: true,
  role: true,
  active: true,
  sessionVersion: true,
  createdAt: true,
} as const;

export type RegisterInput = {
  name: string;
  email: string;
  password: string;
  phone?: string;
  marketingOptIn?: boolean;
};

export type UpdateProfileInput = { name?: string; phone?: string };

const INVALID_PASSWORD_HASH = '$2b$10$QM.2grzBHsuv89FapNwrluod/a6JF30x1MWsGSi9NnhdYdvoswmd2';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  private sign(user: { id: string; email: string; role: string; sessionVersion: number }) {
    return this.jwt.signAsync({ sub: user.id, email: user.email, role: user.role, sv: user.sessionVersion });
  }

  private publicUser<T extends { sessionVersion: number; passwordHash?: string }>(
    user: T,
  ): Omit<T, 'sessionVersion' | 'passwordHash'> {
    const { sessionVersion: _sessionVersion, passwordHash: _passwordHash, ...safe } = user;
    return safe;
  }

  async register(input: RegisterInput) {
    const email = input.email.trim().toLowerCase();
    let user: Prisma.UserGetPayload<{ select: typeof SAFE_USER }>;
    try {
      user = await this.prisma.user.create({
        data: {
          email,
          name: input.name.trim(),
          phone: input.phone?.trim() || null,
          passwordHash: await bcrypt.hash(input.password, 10),
          role: 'GUEST',
          kvkkAcceptedAt: new Date(),
          marketingOptIn: input.marketingOptIn ?? false,
          lastLoginAt: new Date(),
        },
        select: SAFE_USER,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Bu e‑posta adresi zaten kayıtlı.');
      }
      throw error;
    }

    return { token: await this.sign(user), user: this.publicUser(user) };
  }

  async login(rawEmail: string, password: string) {
    const email = rawEmail.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { ...SAFE_USER, passwordHash: true },
    });

    // Kullanıcı yoksa da hash karşılaştırması yapıyoruz ki yanıt süresi
    // e‑postanın kayıtlı olup olmadığını sızdırmasın.
    const hash = user?.passwordHash ?? INVALID_PASSWORD_HASH;
    const ok = await bcrypt.compare(password, hash);
    if (!user || !ok) throw new UnauthorizedException('E‑posta veya şifre hatalı.');
    if (!user.active) throw new UnauthorizedException('Hesabınız devre dışı bırakılmış.');

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const safe = this.publicUser(user);
    return {
      token: await this.sign(user),
      user: safe,
    };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: SAFE_USER,
    });
    if (!user?.active) throw new UnauthorizedException('Oturum artık geçerli değil.');
    return this.publicUser(user);
  }

  async updateProfile(userId: string, input: UpdateProfileInput) {
    if (input.name === undefined && input.phone === undefined) {
      throw new BadRequestException('Değiştirilecek bir alan gönderin.');
    }
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.phone !== undefined ? { phone: input.phone.trim() || null } : {}),
      },
      select: SAFE_USER,
    });
    return { token: await this.sign(user), user: this.publicUser(user) };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    if (currentPassword === newPassword) {
      throw new BadRequestException('Yeni şifre mevcut şifreden farklı olmalı.');
    }
    const current = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!current?.active || !(await bcrypt.compare(currentPassword, current.passwordHash))) {
      throw new BadRequestException('Mevcut şifre hatalı.');
    }
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: await bcrypt.hash(newPassword, 10),
        sessionVersion: { increment: 1 },
      },
      select: SAFE_USER,
    });
    return { token: await this.sign(user), user: this.publicUser(user) };
  }
}
