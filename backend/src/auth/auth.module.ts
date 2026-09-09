import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import { PrismaService } from '../prisma.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtGuard } from './jwt.guard';
import { RolesGuard } from './roles.guard';

@Global()
@Module({
  imports: [
    ConfigModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService): JwtModuleOptions => {
        const secret = config.get<string>('JWT_SECRET');
        if (!secret && config.get('NODE_ENV') === 'production') {
          throw new Error('Production ortamında JWT_SECRET zorunludur.');
        }
        return {
          secret: secret ?? 'dev-secret-degistir',
          signOptions: { expiresIn: '7d' },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtGuard, RolesGuard, PrismaService],
  exports: [JwtGuard, RolesGuard, JwtModule],
})
export class AuthModule {}
