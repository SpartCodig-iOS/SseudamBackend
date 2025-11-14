import 'reflect-metadata';
import dns from 'node:dns';
dns.setDefaultResultOrder('ipv4first');

import path from 'node:path';
import { json, urlencoded } from 'express';
import helmet, { HelmetOptions } from 'helmet';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { env } from './config/env';
import { logger } from './utils/logger';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  const helmetOptions: HelmetOptions = {
    contentSecurityPolicy: false,
  };

  app.use(helmet(helmetOptions));
  app.enableCors();
  app.use(json());
  app.use(urlencoded({ extended: true }));
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useStaticAssets(path.join(process.cwd(), 'public'), { prefix: '/public/' });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Sseduam App Server API')
    .setDescription('Sseduam 연동 인증/프로필 API')
    .setVersion('1.0.0')
    .addTag('Health', '서버 상태 및 헬스체크')
    .addTag('Auth', '이메일/소셜 로그인/로그아웃')
    .addTag('OAuth', '소셜 OAuth 연동')
    .addTag('Profile', '프로필 조회/수정')
    .addTag('Session', '세션 조회')
    .addTag('Travels', '여행 CRUD')
    .addTag('Travel Expenses', '여행 지출 기록')
    .addTag('Travel Settlements', '정산/통계')
    .addTag('Meta', '메타/환율 정보')
    .addBearerAuth()
    .addServer(
      env.nodeEnv === 'production'
        ? 'https://sseudam.up.railway.app'
        : `http://localhost:${env.port}`,
    )
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig, {
    deepScanRoutes: true,
  });

  SwaggerModule.setup('api-docs', app, document, {
    explorer: true,
    swaggerOptions: {
      docExpansion: 'list',
      defaultModelsExpandDepth: 1,
      defaultModelExpandDepth: 1,
      displayRequestDuration: true,
      filter: true,
      showExtensions: true,
      showCommonExtensions: true,
      tryItOutEnabled: true,
    },
  });

  await app.listen(env.port);
  logger.info('Server listening', { port: env.port, env: env.nodeEnv });
}

bootstrap();
