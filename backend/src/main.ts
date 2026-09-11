import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { join } from 'path';
import { AppModule } from './app.module';
import { isAllowedMutationOrigin } from './security/csrf-origin';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // nginx (deploy/nginx/my-villa.conf) proxy'sinin arkasında çalışır; X-Forwarded-For/Proto
  // güvenilmeden req.ip her zaman 127.0.0.1 olur ve ThrottlerGuard'ın IP bazlı limitleri
  // tüm istemcileri tek "kullanıcı" sayar. Yalnızca ilk hop (nginx) güvenilir.
  app.set('trust proxy', 1);

  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.use(
    helmet({
      // API JSON döndürür; varsayılan CSP, inline/harici içerik göstermeyen bir
      // backend için gereksiz kısıtlama getirir. Statik /uploads varlıkları için
      // yine de temel korumalar (nosniff, frameguard, HSTS) devrede kalır.
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  const allowedOrigins = process.env.FRONTEND_ORIGIN?.split(',').map((o) => o.trim()).filter(Boolean);
  if (!allowedOrigins?.length) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Production ortamında FRONTEND_ORIGIN zorunludur (CORS origin=true ile açık bırakılamaz).');
    }
    console.warn("FRONTEND_ORIGIN tanımlı değil; geliştirme modunda tüm originlere izin veriliyor.");
  }
  app.enableCors({
    origin: allowedOrigins?.length ? allowedOrigins : true,
    credentials: true,
  });
  app.use((req, res, next) => {
    if (!isAllowedMutationOrigin(req.method, req.headers.origin, allowedOrigins ?? [])) {
      return res.status(403).json({ message: 'Geçersiz istek kaynağı.' });
    }
    next();
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // Villa ve CMS görselleri herkese açık; host-application belgeleri açık değildir.
  app.useStaticAssets(join(process.cwd(), 'uploads', 'villas'), { prefix: '/uploads/villas' });
  app.useStaticAssets(join(process.cwd(), 'uploads', 'media'), { prefix: '/uploads/media' });

  const port = Number(process.env.PORT ?? 4000);
  // TLS termination ve internet erişimi nginx'te; Node yalnızca loopback'ten
  // dinleyerek 4000 portunun yanlışlıkla dışarı açılmasını engeller.
  await app.listen(port, '127.0.0.1');
  console.log(`API → http://127.0.0.1:${port}/api`);
}
bootstrap();
