import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import { PrismaService } from '../prisma.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtGuard } from './jwt.guard';
import { RolesGuard } from './roles.guard';

export const JWT_ISSUER = 'villa-rent-area';
export const JWT_AUDIENCE = 'villa-rent-area-web';

export function jwtOptions(secret?: string): JwtModuleOptions {
  if (!secret || Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error('JWT_SECRET en az 32 byte uzunluğunda rastgele bir değer olmalıdır.');
  }
  return {
    secret,
    signOptions: {
      expiresIn: '7d',
      algorithm: 'HS256',
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    },
    verifyOptions: {
      algorithms: ['HS256'],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    },
  };
}

@Global()
@Module({
  imports: [
    ConfigModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService): JwtModuleOptions => jwtOptions(config.get<string>('JWT_SECRET')),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtGuard, RolesGuard, PrismaService],
  exports: [JwtGuard, RolesGuard, JwtModule],
})
export class AuthModule {}
