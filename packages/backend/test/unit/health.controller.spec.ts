import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { HealthController } from '../../src/health/health.controller';
import { DATABASE_PROVIDER } from '../../src/database/database.module';

describe('HealthController', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: DATABASE_PROVIDER,
          useValue: {
            raw: jest.fn().mockRejectedValue(new Error('database unavailable')),
          },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns HTTP 503 when the database readiness check fails', async () => {
    const response = await request(app.getHttpServer()).get('/health/ready').expect(503);

    expect(response.body).toMatchObject({ status: 'not ready' });
  });
});
