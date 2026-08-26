/**
 * Auth service unit tests.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from '../../src/auth/auth.service';
import { DATABASE_PROVIDER } from '../../src/database/database.module';
import { UnauthorizedException, ConflictException } from '@nestjs/common';

jest.mock('bcryptjs', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

jest.mock('jsonwebtoken', () => ({
  sign: jest.fn(() => 'mock-jwt-token'),
  verify: jest.fn(),
}));

const bcrypt = require('bcryptjs');

function createQb() {
  return {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    whereNull: jest.fn().mockReturnThis(),
    first: jest.fn(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn(),
    del: jest.fn(),
    count: jest.fn(),
    returning: jest.fn(),
    from: jest.fn(),
    select: jest.fn().mockReturnThis(),
    raw: jest.fn(),
    transaction: jest.fn(),
  };
}

describe('AuthService', () => {
  let service: AuthService;
  let qb: ReturnType<typeof createQb>;
  let mockDb: jest.Mock;

  beforeEach(async () => {
    jest.clearAllMocks();
    qb = createQb();
    // trx is a Knex transaction — it must be callable (like Knex itself)
    const trx = jest.fn().mockReturnValue(qb);
    mockDb = jest.fn().mockReturnValue(qb) as jest.Mock & { transaction: jest.Mock };
    (mockDb as any).transaction = jest.fn((cb: (t: any) => any) => cb(trx));
    qb.first.mockResolvedValue(null);
    qb.returning.mockResolvedValue([{}]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: DATABASE_PROVIDER, useValue: mockDb },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('login', () => {
    function setupBasic() {
      const tenant = { id: 'tenant-1', slug: 'acme', name: 'Acme Corp', settings: '{}', deleted_at: null };
      const user = { id: 'user-1', email: 'admin@acme.com', display_name: 'Admin', password_hash: 'hash', is_active: true, deleted_at: null };
      const membership = { id: 'membership-1', tenant_id: 'tenant-1', user_id: 'user-1', role: 'admin', is_active: true };
      return { tenant, user, membership };
    }

    it('succeeds with valid credentials', async () => {
      const { tenant, user, membership } = setupBasic();
      qb.first
        .mockResolvedValueOnce(tenant)
        .mockResolvedValueOnce(user)
        .mockResolvedValueOnce(membership);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.login({ email: 'admin@acme.com', password: 'correct', tenantSlug: 'acme' });
      expect(result.accessToken).toBe('mock-jwt-token');
      expect(result.user.email).toBe('admin@acme.com');
    });

    it('rejects invalid tenant slug', async () => {
      qb.first.mockResolvedValueOnce(null);
      await expect(service.login({ email: 'admin@acme.com', password: 'pwd', tenantSlug: 'bad' }))
        .rejects.toThrow(UnauthorizedException);
    });

    it('rejects a missing tenant slug without querying the database', async () => {
      const previousDefaultTenant = process.env.DEFAULT_TENANT_SLUG;
      delete process.env.DEFAULT_TENANT_SLUG;

      try {
        await expect(
          service.login({ email: 'admin@acme.com', password: 'password123' }),
        ).rejects.toThrow('Tenant slug is required');
        expect(mockDb).not.toHaveBeenCalled();
      } finally {
        if (previousDefaultTenant === undefined) {
          delete process.env.DEFAULT_TENANT_SLUG;
        } else {
          process.env.DEFAULT_TENANT_SLUG = previousDefaultTenant;
        }
      }
    });

    it('rejects invalid email', async () => {
      qb.first.mockResolvedValueOnce({ id: 'tenant-1', settings: '{}' }).mockResolvedValueOnce(null);
      await expect(service.login({ email: 'wrong@email.com', password: 'pwd', tenantSlug: 'acme' }))
        .rejects.toThrow(UnauthorizedException);
    });

    it.each([
      { is_active: false, deleted_at: null },
      { is_active: true, deleted_at: new Date() },
    ])('rejects inactive or deleted users: %j', async () => {
      qb.first
        .mockResolvedValueOnce({ id: 'tenant-1', slug: 'acme', settings: '{}' })
        .mockResolvedValueOnce(null);

      await expect(
        service.login({
          email: 'disabled@acme.com',
          password: 'secret',
          tenantSlug: 'acme',
        }),
      ).rejects.toThrow('Invalid tenant or credentials');

      expect(qb.where).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'disabled@acme.com',
          is_active: true,
          deleted_at: null,
        }),
      );
    });

    it('rejects wrong password', async () => {
      qb.first
        .mockResolvedValueOnce({ id: 'tenant-1', settings: '{}' })
        .mockResolvedValueOnce({ id: 'user-1', password_hash: 'hash', is_active: true, deleted_at: null });
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.login({ email: 'admin@acme.com', password: 'wrong', tenantSlug: 'acme' }))
        .rejects.toThrow(UnauthorizedException);
    });

    it('rejects inactive membership', async () => {
      qb.first
        .mockResolvedValueOnce({ id: 'tenant-1', settings: '{}' })
        .mockResolvedValueOnce({ id: 'user-1', password_hash: 'hash', is_active: true, deleted_at: null })
        .mockResolvedValueOnce(null);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await expect(service.login({ email: 'admin@acme.com', password: 'pwd', tenantSlug: 'acme' }))
        .rejects.toThrow(UnauthorizedException);
    });
  });

  describe('register', () => {
    it('registers a new user', async () => {
      qb.first
        .mockResolvedValueOnce({ id: 'tenant-1', slug: 'acme' })
        .mockResolvedValueOnce(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed');

      await service.register({ email: 'new@acme.com', password: 'pass123', displayName: 'New', tenantSlug: 'acme' });
      expect((mockDb as any).transaction).toHaveBeenCalled();
    });

    it('rejects existing member', async () => {
      qb.first
        .mockResolvedValueOnce({ id: 'tenant-1' })
        .mockResolvedValueOnce({ id: 'user-1' })
        .mockResolvedValueOnce({ id: 'membership-1' });
      (bcrypt.hash as jest.Mock).mockResolvedValue('hash');

      await expect(service.register({ email: 'existing@acme.com', password: 'pass123', displayName: 'Existing', tenantSlug: 'acme' }))
        .rejects.toThrow(ConflictException);
    });

    it('rejects nonexistent tenant', async () => {
      qb.first.mockResolvedValueOnce(null);
      await expect(service.register({ email: 'u@e.com', password: 'pass123', displayName: 'U', tenantSlug: 'nope' }))
        .rejects.toThrow(UnauthorizedException);
    });
  });
});
