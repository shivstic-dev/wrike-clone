import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

jest.mock('@nestjs/core', () => ({
  NestFactory: {
    create: jest.fn(),
  },
}));
jest.mock('./app.module', () => ({ AppModule: class AppModule {} }));
jest.mock('./common/sentry', () => ({ initSentry: jest.fn() }));
jest.mock('./config/app.config', () => ({
  loadAppConfig: jest.fn(() => ({
    nodeEnv: 'test',
    port: 4000,
    apiPrefix: '/api/v1',
    corsOrigins: ['http://localhost:5173'],
  })),
  validateProductionConfig: jest.fn(),
}));

describe('application bootstrap', () => {
  it('registers strict global request validation', async () => {
    const app = {
      use: jest.fn(),
      useGlobalPipes: jest.fn(),
      enableCors: jest.fn(),
      setGlobalPrefix: jest.fn(),
      enableShutdownHooks: jest.fn(),
      listen: jest.fn().mockResolvedValue(undefined),
    };
    (NestFactory.create as jest.Mock).mockResolvedValue(app);

    await import('./main');
    await Promise.resolve();

    expect(app.useGlobalPipes).toHaveBeenCalledTimes(1);
    const pipe = app.useGlobalPipes.mock.calls[0][0] as ValidationPipe;
    expect(pipe).toBeInstanceOf(ValidationPipe);
    expect((pipe as any).isTransformEnabled).toBe(true);
    expect((pipe as any).validatorOptions).toMatchObject({
      whitelist: true,
      forbidNonWhitelisted: true,
    });
  });
});
