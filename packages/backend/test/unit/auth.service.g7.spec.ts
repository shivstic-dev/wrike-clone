/**
 * Auth service unit tests — G7 httpOnly cookies, changePassword, adminResetPassword, brute-force lockout.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from '../../src/auth/auth.service';
import { DATABASE_PROVIDER } from '../../src/database/database.module';
import { UnauthorizedException } from '@nestjs/common';

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
    join: jest.fn().mockReturnThis(),
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

describe('AuthService (G7 + Phase 2 features)', () => {
  let service: AuthService;
  let qb: ReturnType<typeof createQb>;
  let mockDb: jest.Mock;

  beforeEach(async () => {
    jest.clearAllMocks();
    qb = createQb();
    const trx = jest.fn().mockReturnValue(qb);
    mockDb = jest.fn().mockReturnValue(qb) as jest.Mock & { transaction: jest.Mock };
    (mockDb as any).transaction = jest.fn((cb: (t: any) => any) => cb(trx));
    qb.first.mockResolvedValue(null);
    qb.returning.mockResolvedValue([{}]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [AuthService, { provide: DATABASE_PROVIDER, useValue: mockDb }],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('changePassword', () => {
    it('changes password successfully and rotates sessions', async () => {
      qb.first.mockResolvedValue({
        id: 'user-1',
        email: 'admin@acme.com',
        password_hash: 'old-hash',
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (bcrypt.hash as jest.Mock).mockResolvedValue('new-hash');

      await service.changePassword('user-1', 'old-password', 'new-password-123');

      expect((mockDb as any).transaction).toHaveBeenCalled();
      expect(qb.update).toHaveBeenCalledWith(
        expect.objectContaining({ must_change_password: false }),
      );
      expect(qb.update).toHaveBeenCalledWith(
        expect.objectContaining({ expires_at: expect.any(Date) }),
      );
    });

    it('rejects wrong current password', async () => {
      qb.first.mockResolvedValue({
        id: 'user-1',
        password_hash: 'hash',
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.changePassword('user-1', 'wrong', 'new-pass-123')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects same password', async () => {
      qb.first.mockResolvedValue({
        id: 'user-1',
        password_hash: 'hash',
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await expect(service.changePassword('user-1', 'same-pass', 'same-pass')).rejects.toThrow(
        'New password must be different from current password',
      );
    });

    it('rejects nonexistent user', async () => {
      qb.first.mockResolvedValue(null);

      await expect(service.changePassword('no-user', 'pwd', 'new-pwd-123')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('adminResetPassword', () => {
    it('resets password and sets must_change_password', async () => {
      qb.first.mockResolvedValue({
        id: 'user-1',
        email: 'user@acme.com',
        password_hash: 'old-hash',
      });
      (bcrypt.hash as jest.Mock).mockResolvedValue('temp-hash');

      await service.adminResetPassword('user-1', 'tempPass123!', 'tenant-1');

      expect((mockDb as any).transaction).toHaveBeenCalled();
      expect(qb.update).toHaveBeenCalledWith(
        expect.objectContaining({ must_change_password: true }),
      );
    });

    it('rejects nonexistent user', async () => {
      qb.first.mockResolvedValue(null);

      await expect(
        service.adminResetPassword('no-user', 'tempPass123!', 'tenant-1'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('refreshToken', () => {
    it.each([
      ['missing', null],
      ['inactive', { id: 'user-1', email: 'user@acme.com', is_active: false, deleted_at: null }],
      [
        'deleted',
        { id: 'user-1', email: 'user@acme.com', is_active: true, deleted_at: new Date() },
      ],
    ])('rejects a %s user before rotating the session', async (_label, user) => {
      qb.first
        .mockResolvedValueOnce({
          id: 'session-1',
          user_id: 'user-1',
          tenant_id: 'tenant-1',
          membership_id: 'membership-1',
        })
        .mockResolvedValueOnce({
          id: 'membership-1',
          user_id: 'user-1',
          tenant_id: 'tenant-1',
          role: 'member',
          is_active: true,
        })
        .mockResolvedValueOnce(user);

      await expect(service.refreshToken({ refreshToken: 'refresh-token' })).rejects.toThrow(
        'Account no longer active',
      );
      expect(qb.update).not.toHaveBeenCalled();
    });
  });

  describe('login with brute-force lockout', () => {
    it('locks account after 10 failed attempts', async () => {
      qb.first
        .mockResolvedValueOnce({
          id: 'tenant-1',
          slug: 'acme',
          name: 'Acme',
          settings: '{}',
          deleted_at: null,
        })
        .mockResolvedValueOnce({
          id: 'user-1',
          email: 'admin@acme.com',
          password_hash: 'hash',
          failed_login_attempts: 9,
          locked_until: null,
        });
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.login({ email: 'admin@acme.com', password: 'wrong', tenantSlug: 'acme' }),
      ).rejects.toThrow(UnauthorizedException);

      // Should set locked_until
      expect(qb.update).toHaveBeenCalledWith(
        expect.objectContaining({
          failed_login_attempts: 10,
          locked_until: expect.any(Date),
        }),
      );
    });

    it('rejects login when account is locked', async () => {
      qb.first
        .mockResolvedValueOnce({
          id: 'tenant-1',
          slug: 'acme',
          name: 'Acme',
          settings: '{}',
          deleted_at: null,
        })
        .mockResolvedValueOnce({
          id: 'user-1',
          email: 'admin@acme.com',
          password_hash: 'hash',
          locked_until: new Date(Date.now() + 60_000), // locked for 1 more minute
        });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await expect(
        service.login({ email: 'admin@acme.com', password: 'any', tenantSlug: 'acme' }),
      ).rejects.toThrow('Account temporarily locked');
    });

    it('returns mustChangePassword flag when user must change password', async () => {
      qb.first
        .mockResolvedValueOnce({
          id: 'tenant-1',
          slug: 'acme',
          name: 'Acme',
          settings: '{}',
          deleted_at: null,
        })
        .mockResolvedValueOnce({
          id: 'user-1',
          email: 'admin@acme.com',
          display_name: 'Admin',
          password_hash: 'hash',
          must_change_password: true,
          failed_login_attempts: 0,
          locked_until: null,
        })
        .mockResolvedValueOnce({
          id: 'membership-1',
          tenant_id: 'tenant-1',
          user_id: 'user-1',
          role: 'admin',
          is_active: true,
        });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.login({
        email: 'admin@acme.com',
        password: 'correct',
        tenantSlug: 'acme',
      });
      expect(result.mustChangePassword).toBe(true);
    });

    it('resets failed attempt counter on successful login', async () => {
      qb.first
        .mockResolvedValueOnce({
          id: 'tenant-1',
          slug: 'acme',
          name: 'Acme',
          settings: '{}',
          deleted_at: null,
        })
        .mockResolvedValueOnce({
          id: 'user-1',
          email: 'admin@acme.com',
          display_name: 'Admin',
          password_hash: 'hash',
          must_change_password: false,
          failed_login_attempts: 3,
          locked_until: null,
        })
        .mockResolvedValueOnce({
          id: 'membership-1',
          tenant_id: 'tenant-1',
          user_id: 'user-1',
          role: 'admin',
          is_active: true,
        });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await service.login({ email: 'admin@acme.com', password: 'correct', tenantSlug: 'acme' });

      // Should reset failed login counter
      expect(qb.update).toHaveBeenCalledWith(
        expect.objectContaining({ failed_login_attempts: 0, locked_until: null }),
      );
    });
  });
});
