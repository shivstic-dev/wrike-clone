import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { AuthGuard } from '../../src/common/guards/auth.guard';
import { RolesGuard } from '../../src/common/guards/roles.guard';
import { CustomizationController } from '../../src/customization/customization.controller';
import { CustomizationService } from '../../src/customization/customization.service';
import { PublicFormsController } from '../../src/customization/public-forms.controller';

describe('request form DTO validation', () => {
  async function createApp() {
    const module = await Test.createTestingModule({
      controllers: [CustomizationController, PublicFormsController],
      providers: [
        {
          provide: CustomizationService,
          useValue: {
            createRequestForm: jest.fn().mockResolvedValue({ id: 'form-id' }),
            submitRequestForm: jest.fn().mockResolvedValue({ id: 'task-id' }),
            submitPublicRequestForm: jest.fn().mockResolvedValue({ id: 'task-id' }),
          },
        },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    const app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();
    return app;
  }

  it('rejects unknown nested properties while creating a request form', async () => {
    const app = await createApp();
    try {
      await request(app.getHttpServer())
        .post('/customization/request-forms')
        .send({
          name: 'Intake',
          folderId: '50000000-0000-4000-8000-000000000005',
          fields: [
            { name: 'title', type: 'text', required: true, unexpected: 'reject this' },
          ],
        })
        .expect(400);
    } finally {
      await app.close();
    }
  });

  it('rejects unknown top-level properties on public request form submissions', async () => {
    const app = await createApp();
    try {
      await request(app.getHttpServer())
        .post('/public/forms/90000000-0000-4000-8000-000000000009/submit')
        .send({ values: { title: 'Request' }, unexpected: true })
        .expect(400);
    } finally {
      await app.close();
    }
  });
});
