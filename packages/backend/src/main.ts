/**
 * Application bootstrap.
 * Creates the NestJS application, configures middleware, and starts listening.
 */

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { loadAppConfig, validateProductionConfig } from './config/app.config';
import { initSentry } from './common/sentry';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';

// Initialize Sentry error monitoring (must be before any other imports)
initSentry();

async function bootstrap(): Promise<void> {
  validateProductionConfig();
  const config = loadAppConfig();
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Security headers
  app.use(helmet());

  // CORS
  app.enableCors({
    origin: config.corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-Id'],
  });

  // Compression
  app.use(compression());

  // Cookie parser (for refresh tokens)
  app.use(cookieParser());

  // Global API prefix
  app.setGlobalPrefix(config.apiPrefix);

  // Graceful shutdown
  app.enableShutdownHooks();

  // Start listening
  await app.listen(config.port, '0.0.0.0');
  console.log(`[${config.nodeEnv}] Work Management API running on port ${config.port}`);
  console.log(`API prefix: ${config.apiPrefix}`);
}

bootstrap().catch((err) => {
  console.error('Failed to start application:', err);
  process.exit(1);
});
