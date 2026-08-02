import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { HealthController } from '../../src/health/health.controller';
import { DATABASE_PROVIDER } from '../../src/database/database.module';

describe('HealthController', () => {
  let app: INestApplication;
  const db = {
    raw: jest.fn(),
  };

  beforeAll(async () => {
    db.raw.mockRejectedValue(new Error('database unavailable'));
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: DATABASE_PROVIDER,
          useValue: db,
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('keeps liveness available while readiness fails closed', async () => {
    db.raw.mockRejectedValue(new Error('database unavailable'));
    await request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect(({ body }) => expect(body.status).toBe('degraded'));
    await request(app.getHttpServer())
      .get('/health/ready')
      .expect(503)
      .expect(({ body }) => expect(body.status).toBe('not ready'));
  });
});
