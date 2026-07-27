/**
 * Shared package — validation schema tests.
 * Ensures all Zod schemas correctly validate and reject inputs.
 */

import {
  createTenantSchema,
  bootstrapTenantSchema,
  createWorkspaceSchema,
  createFolderSchema,
  createProjectSchema,
  createTaskSchema,
  updateTaskSchema,
  taskFilterSchema,
  inviteUserSchema,
  createDependencySchema,
  loginSchema,
  registerSchema,
  adminResetPasswordSchema,
  bulkTaskUpdateSchema,
  changePasswordSchema,
  addWorkspaceMemberSchema,
  updateWorkspaceMemberRoleSchema,
} from '../src/validation';

function validUUID(): string {
  return '00000000-0000-4000-8000-000000000000';
}

describe('Validation Schemas', () => {
  describe('loginSchema', () => {
    it('accepts valid login input', () => {
      const result = loginSchema.safeParse({
        email: 'user@example.com',
        password: 'password123',
        tenantSlug: 'acme-corp',
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid email', () => {
      const result = loginSchema.safeParse({
        email: 'not-an-email',
        password: 'password123',
        tenantSlug: 'acme-corp',
      });
      expect(result.success).toBe(false);
    });

    it('rejects short password', () => {
      const result = loginSchema.safeParse({
        email: 'user@example.com',
        password: 'short',
        tenantSlug: 'acme-corp',
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid tenant slug', () => {
      const result = loginSchema.safeParse({
        email: 'user@example.com',
        password: 'password123',
        tenantSlug: 'Invalid Slug!',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('registration and password reset schemas', () => {
    it('accepts a strong registration payload', () => {
      expect(
        registerSchema.safeParse({
          email: 'user@example.com',
          password: 'long-password-123',
          displayName: 'Example User',
          tenantSlug: 'acme-corp',
        }).success,
      ).toBe(true);
    });

    it('rejects weak registration passwords', () => {
      expect(
        registerSchema.safeParse({
          email: 'user@example.com',
          password: 'password',
          displayName: 'Example User',
          tenantSlug: 'acme-corp',
        }).success,
      ).toBe(false);
    });

    it('requires a UUID and strong temporary password for admin resets', () => {
      expect(
        adminResetPasswordSchema.safeParse({
          userId: validUUID(),
          tempPassword: 'temporary-pass-123',
        }).success,
      ).toBe(true);
      expect(
        adminResetPasswordSchema.safeParse({
          userId: 'not-a-uuid',
          tempPassword: 'short',
        }).success,
      ).toBe(false);
    });
  });

  describe('createTenantSchema', () => {
    it('accepts valid tenant data', () => {
      const result = createTenantSchema.safeParse({
        name: 'Acme Corp',
        slug: 'acme-corp',
        domain: 'acme.com',
      });
      expect(result.success).toBe(true);
    });

    it('rejects empty name', () => {
      const result = createTenantSchema.safeParse({ name: '', slug: 'acme' });
      expect(result.success).toBe(false);
    });

    it('rejects invalid slug format', () => {
      const result = createTenantSchema.safeParse({ name: 'Test', slug: 'INVALID SLUG!' });
      expect(result.success).toBe(false);
    });
  });

  describe('bootstrapTenantSchema', () => {
    it('accepts a tenant with a strong first-administrator account', () => {
      const result = bootstrapTenantSchema.safeParse({
        tenant: { name: 'Acme Corp', slug: 'acme-corp' },
        admin: {
          email: 'admin@example.com',
          password: 'strong-password-123',
          displayName: 'Admin User',
        },
      });
      expect(result.success).toBe(true);
    });

    it('rejects weak bootstrap administrator credentials', () => {
      const result = bootstrapTenantSchema.safeParse({
        tenant: { name: 'Acme Corp', slug: 'acme-corp' },
        admin: {
          email: 'not-an-email',
          password: 'short',
          displayName: '',
        },
      });
      expect(result.success).toBe(false);
    });
  });

  describe('createWorkspaceSchema', () => {
    it('accepts valid workspace', () => {
      const result = createWorkspaceSchema.safeParse({
        name: 'Engineering',
        description: 'Engineering department workspace',
      });
      expect(result.success).toBe(true);
    });

    it('rejects empty name', () => {
      const result = createWorkspaceSchema.safeParse({ name: '' });
      expect(result.success).toBe(false);
    });

    it('accepts minimal workspace (name only)', () => {
      const result = createWorkspaceSchema.safeParse({ name: 'Marketing' });
      expect(result.success).toBe(true);
    });
  });

  describe('createFolderSchema', () => {
    it('accepts valid folder', () => {
      const result = createFolderSchema.safeParse({
        workspaceId: validUUID(),
        name: 'Q1 Campaigns',
      });
      expect(result.success).toBe(true);
    });

    it('accepts folder with parent', () => {
      const result = createFolderSchema.safeParse({
        workspaceId: validUUID(),
        parentFolderId: validUUID(),
        name: 'Subfolder',
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid workspaceId', () => {
      const result = createFolderSchema.safeParse({
        workspaceId: 'not-a-uuid',
        name: 'Folder',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('createProjectSchema', () => {
    it('accepts valid project', () => {
      const result = createProjectSchema.safeParse({
        folderId: validUUID(),
        name: 'Website Redesign',
      });
      expect(result.success).toBe(true);
    });

    it('accepts project with all fields', () => {
      const result = createProjectSchema.safeParse({
        folderId: validUUID(),
        name: 'Mobile App v2',
        description: 'Complete rewrite of the mobile app',
        startDate: '2026-01-01T00:00:00Z',
        dueDate: '2026-06-30T00:00:00Z',
        priority: 'high',
        budget: 50000,
      });
      expect(result.success).toBe(true);
    });

    it('rejects negative budget', () => {
      const result = createProjectSchema.safeParse({
        folderId: validUUID(),
        name: 'Project',
        budget: -100,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('createTaskSchema', () => {
    it('accepts valid task', () => {
      const result = createTaskSchema.safeParse({
        projectId: validUUID(),
        title: 'Implement login page',
      });
      expect(result.success).toBe(true);
    });

    it('accepts task with all optional fields', () => {
      const result = createTaskSchema.safeParse({
        projectId: validUUID(),
        parentTaskId: validUUID(),
        assigneeId: validUUID(),
        title: 'Design system components',
        description: 'Build the component library',
        status: 'in_progress',
        priority: 'high',
        estimatedHours: 40,
        startDate: '2026-02-01',
        dueDate: '2026-03-01',
        customFields: { department: 'engineering', sprint: 'S3' },
      });
      expect(result.success).toBe(true);
    });

    it('rejects empty title', () => {
      const result = createTaskSchema.safeParse({
        projectId: validUUID(),
        title: '',
      });
      expect(result.success).toBe(false);
    });

    it('rejects title over 500 chars', () => {
      const result = createTaskSchema.safeParse({
        projectId: validUUID(),
        title: 'x'.repeat(501),
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid status', () => {
      const result = createTaskSchema.safeParse({
        projectId: validUUID(),
        title: 'Task',
        status: 'nonexistent_status',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('updateTaskSchema', () => {
    it('accepts partial update with one field', () => {
      const result = updateTaskSchema.safeParse({ status: 'completed' });
      expect(result.success).toBe(true);
    });

    it('rejects empty update (no fields)', () => {
      const result = updateTaskSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('accepts clearing assignee', () => {
      const result = updateTaskSchema.safeParse({ assigneeId: null });
      expect(result.success).toBe(true);
    });
  });

  describe('taskFilterSchema', () => {
    it('applies defaults for missing fields', () => {
      const result = taskFilterSchema.parse({});
      expect(result.page).toBe(1);
      expect(result.perPage).toBe(25);
    });

    it('parses string page numbers', () => {
      const result = taskFilterSchema.parse({ page: '3', perPage: '50' });
      expect(result.page).toBe(3);
      expect(result.perPage).toBe(50);
    });

    it('accepts filter with status array', () => {
      const result = taskFilterSchema.safeParse({
        status: ['in_progress', 'todo'],
        assigneeId: validUUID(),
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid status in array', () => {
      const result = taskFilterSchema.safeParse({
        status: ['invalid_status'],
      });
      expect(result.success).toBe(false);
    });
  });

  describe('inviteUserSchema', () => {
    it('accepts valid invitation', () => {
      const result = inviteUserSchema.safeParse({
        email: 'colleague@example.com',
        role: 'member',
      });
      expect(result.success).toBe(true);
    });

    it('accepts invitation with message', () => {
      const result = inviteUserSchema.safeParse({
        email: 'colleague@example.com',
        role: 'admin',
        message: 'Welcome to the team!',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('createDependencySchema', () => {
    it('accepts valid dependency', () => {
      const result = createDependencySchema.safeParse({
        taskId: validUUID(),
        dependsOnTaskId: validUUID(),
        dependencyType: 'finish_to_start',
      });
      expect(result.success).toBe(true);
    });

    it('applies default lagDays', () => {
      const result = createDependencySchema.parse({
        taskId: validUUID(),
        dependsOnTaskId: validUUID(),
        dependencyType: 'finish_to_start',
      });
      expect(result.lagDays).toBe(0);
    });
  });

  describe('changePasswordSchema', () => {
    it('accepts valid change password input', () => {
      const result = changePasswordSchema.safeParse({
        currentPassword: 'old-password',
        newPassword: 'new-password-123',
      });
      expect(result.success).toBe(true);
    });

    it('rejects same password', () => {
      const result = changePasswordSchema.safeParse({
        currentPassword: 'same-password',
        newPassword: 'same-password',
      });
      expect(result.success).toBe(false);
    });

    it('rejects short new password', () => {
      const result = changePasswordSchema.safeParse({
        currentPassword: 'old-password',
        newPassword: 'short',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('addWorkspaceMemberSchema', () => {
    it('accepts valid member input', () => {
      const result = addWorkspaceMemberSchema.safeParse({
        email: 'user@company.com',
        displayName: 'Jane Smith',
        tempPassword: 'tempPass123!',
        role: 'employee',
      });
      expect(result.success).toBe(true);
    });

    it('accepts department_head role', () => {
      const result = addWorkspaceMemberSchema.safeParse({
        email: 'admin@company.com',
        displayName: 'Admin',
        tempPassword: 'tempPass123!',
        role: 'department_head',
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid email', () => {
      const result = addWorkspaceMemberSchema.safeParse({
        email: 'not-an-email',
        displayName: 'Name',
        tempPassword: 'tempPass123!',
        role: 'member',
      });
      expect(result.success).toBe(false);
    });

    it('rejects short temp password', () => {
      const result = addWorkspaceMemberSchema.safeParse({
        email: 'user@company.com',
        displayName: 'Name',
        tempPassword: 'short',
        role: 'member',
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid role', () => {
      const result = addWorkspaceMemberSchema.safeParse({
        email: 'user@company.com',
        displayName: 'Name',
        tempPassword: 'tempPass123!',
        role: 'invalid_role',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('updateWorkspaceMemberRoleSchema', () => {
    it('accepts valid role update', () => {
      const result = updateWorkspaceMemberRoleSchema.safeParse({ role: 'department_head' });
      expect(result.success).toBe(true);
    });

    it('rejects invalid role', () => {
      const result = updateWorkspaceMemberRoleSchema.safeParse({ role: 'super_admin' });
      expect(result.success).toBe(false);
    });
  });

  describe('bulkTaskUpdateSchema', () => {
    it('accepts valid bulk update', () => {
      const result = bulkTaskUpdateSchema.safeParse({
        taskIds: [validUUID(), validUUID()],
        updates: { status: 'completed' },
      });
      expect(result.success).toBe(true);
    });

    it('rejects more than 100 task IDs', () => {
      const result = bulkTaskUpdateSchema.safeParse({
        taskIds: Array(101).fill(validUUID()),
        updates: { status: 'done' },
      });
      expect(result.success).toBe(false);
    });
  });
});
