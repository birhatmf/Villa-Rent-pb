import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.enableCors({
    origin: process.env.FRONTEND_ORIGIN?.split(',') ?? true,
    credentials: true,
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // Villa ve CMS görselleri herkese açık; host-application belgeleri açık değildir.
  app.useStaticAssets(join(process.cwd(), 'uploads', 'villas'), { prefix: '/uploads/villas' });
  app.useStaticAssets(join(process.cwd(), 'uploads', 'media'), { prefix: '/uploads/media' });

  await app.listen(process.env.PORT ?? 4000);
  console.log(`API → http://localhost:${process.env.PORT ?? 4000}/api`);
}
bootstrap();
