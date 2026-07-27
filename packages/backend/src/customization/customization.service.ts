/**
 * Customization service — manages per-tenant custom workflows, item types,
 * blueprint templates (reusable project structures), and request forms.
 *
 * IMPORTANT: This service uses dedicated tables (workspace_statuses,
 * project_templates, request_forms) instead of piggybacking on non-existent
 * metadata columns. A migration must create these tables before use.
 */

import { Injectable, NotFoundException, Inject, Logger } from '@nestjs/common';
import { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';
import { DATABASE_PROVIDER } from '../database/database.module';
import { requireTenantContext } from '../common/tenant-context';

// Helper to safely parse JSONB columns
function safeJsonParse(val: unknown): Record<string, unknown> {
  if (!val) return {};
  if (typeof val === 'string') return JSON.parse(val);
  if (typeof val === 'object') return val as Record<string, unknown>;
  return {};
}

@Injectable()
export class CustomizationService {
  private readonly logger = new Logger(CustomizationService.name);

  constructor(@Inject(DATABASE_PROVIDER) private readonly db: Knex) {}

  // ── Custom Field Definitions ───────────────────────────────
  // (Uses existing custom_field_definitions table)

  async findCustomFields() {
    const ctx = requireTenantContext();
    return this.db('custom_field_definitions')
      .where({ tenant_id: ctx.tenantId })
      .orderBy('sort_order', 'asc');
  }

  async createCustomField(input: {
    name: string;
    key: string;
    fieldType: string;
    options?: string[];
    isRequired?: boolean;
  }) {
    const ctx = requireTenantContext();
    const id = uuidv4();
    const [field] = await this.db('custom_field_definitions')
      .insert({
        id,
        tenant_id: ctx.tenantId,
        name: input.name,
        key: input.key,
        field_type: input.fieldType,
        options: input.options ? JSON.stringify(input.options) : null,
        is_required: input.isRequired || false,
      })
      .returning('*');
    return field;
  }

  async deleteCustomField(id: string): Promise<void> {
    const ctx = requireTenantContext();
    await this.db('custom_field_definitions')
      .where({ id, tenant_id: ctx.tenantId })
      .del();
  }

  // ── Custom Item Types ──────────────────────────────────────
  // (Uses existing item_types table)

  async findItemTypes() {
    const ctx = requireTenantContext();
    return this.db('item_types')
      .where({ tenant_id: ctx.tenantId })
      .orderBy('name', 'asc');
  }

  async createItemType(input: { name: string; icon?: string; color?: string }) {
    const ctx = requireTenantContext();
    const id = uuidv4();
    const [itemType] = await this.db('item_types')
      .insert({
        id,
        tenant_id: ctx.tenantId,
        name: input.name,
        icon: input.icon || 'task',
        color: input.color || '#6366f1',
      })
      .returning('*');
    return itemType;
  }

  async deleteItemType(id: string): Promise<void> {
    const ctx = requireTenantContext();
    await this.db('item_types')
      .where({ id, tenant_id: ctx.tenantId })
      .del();
  }

  // ── Workspace Custom Statuses ─────────────────────────────
  // Uses workspace_statuses table (requires migration)

  async getWorkspaceStatuses(workspaceId: string) {
    const ctx = requireTenantContext();
    return this.db('workspace_statuses')
      .where({ workspace_id: workspaceId, tenant_id: ctx.tenantId })
      .orderBy('sort_order', 'asc');
  }

  async setWorkspaceStatuses(
    workspaceId: string,
    statuses: Array<{ name: string; color: string; category: string }>,
  ) {
    const ctx = requireTenantContext();

    // Validate workspace exists
    const ws = await this.db('workspaces')
      .where({ id: workspaceId, tenant_id: ctx.tenantId })
      .first();
    if (!ws) throw new NotFoundException('Workspace not found');

    // Replace all statuses for this workspace in a transaction
    await this.db.transaction(async (trx: any) => {
      await trx('workspace_statuses')
        .where({ workspace_id: workspaceId, tenant_id: ctx.tenantId })
        .del();

      if (statuses.length > 0) {
        const inserts = statuses.map((s, i) => ({
          id: uuidv4(),
          tenant_id: ctx.tenantId,
          workspace_id: workspaceId,
          name: s.name,
          color: s.color,
          category: s.category,
          sort_order: i,
        }));
        await trx('workspace_statuses').insert(inserts);
      }
    });

    return statuses;
  }

  // ── Blueprint Templates ──────────────────────────────────────
  // Uses project_templates table (requires migration)

  async findBlueprints() {
    const ctx = requireTenantContext();
    return this.db('project_templates')
      .where({ tenant_id: ctx.tenantId })
      .orderBy('name', 'asc');
  }

  async saveAsBlueprint(projectId: string) {
    const ctx = requireTenantContext();
    const project = await this.db('projects')
      .where({ id: projectId, tenant_id: ctx.tenantId })
      .first();
    if (!project) throw new NotFoundException('Project not found');

    const tasks = await this.db('tasks')
      .where({ project_id: projectId, deleted_at: null })
      .select('title', 'description', 'priority', 'estimated_hours');

    const templateId = uuidv4();
    const [template] = await this.db('project_templates')
      .insert({
        id: templateId,
        tenant_id: ctx.tenantId,
        name: `${project.name} (template)`,
        description: project.description,
        source_project_id: projectId,
        task_template: JSON.stringify(tasks.map((t: any) => ({
          title: t.title,
          description: t.description,
          priority: t.priority,
          estimated_hours: t.estimated_hours,
        }))),
      })
      .returning('*');

    return template;
  }

  async createFromBlueprint(blueprintId: string, name: string, folderId: string) {
    const ctx = requireTenantContext();

    const template = await this.db('project_templates')
      .where({ id: blueprintId, tenant_id: ctx.tenantId })
      .first();
    if (!template) throw new NotFoundException('Blueprint not found');

    const taskTemplate = safeJsonParse(template.task_template);
    const templateTasks = Array.isArray(taskTemplate) ? taskTemplate : [];

    // Create project
    const projectId = uuidv4();
    const [project] = await this.db('projects')
      .insert({
        id: projectId,
        tenant_id: ctx.tenantId,
        folder_id: folderId,
        owner_id: ctx.userId,
        name,
        description: template.description,
        status: 'active',
        priority: 'none',
        visibility: 'department',
      })
      .returning('*');

    // Clone tasks from template
    if (templateTasks.length > 0) {
      const newTasks = templateTasks.map((t: any) => ({
        id: uuidv4(),
        tenant_id: ctx.tenantId,
        project_id: projectId,
        created_by_id: ctx.userId,
        title: t.title || 'Task',
        description: t.description || null,
        status: 'todo',
        priority: t.priority || 'none',
        estimated_hours: t.estimated_hours || null,
        sort_order: 0,
        custom_fields: '{}',
      }));

      await this.db('tasks').insert(newTasks);
    }

    return project;
  }

  // ── Public Form Access (no auth required) ────────────────

  /**
   * Fetch a single request form for public viewing.
   * Only returns public-safe fields (name, description, fields).
   * No authentication required — safe for external stakeholders.
   */
  async getPublicForm(formId: string) {
    const form = await this.db('request_forms')
      .where({ id: formId })
      .select('id', 'name', 'description', 'form_fields', 'tenant_id')
      .first();
    if (!form) throw new NotFoundException('Request form not found');

    return {
      id: form.id,
      name: form.name,
      description: form.description,
      fields: typeof form.form_fields === 'string' ? JSON.parse(form.form_fields) : form.form_fields,
    };
  }

  /**
   * Submit a request form from a public (unauthenticated) user.
   * Looks up the form to get tenant_id, folder_id, and uses a system
   * fallback for created_by since no authenticated user context exists.
   */
  async submitPublicRequestForm(formId: string, values: Record<string, unknown>) {
    const form = await this.db('request_forms')
      .where({ id: formId })
      .select('id', 'name', 'folder_id', 'tenant_id', 'form_fields')
      .first();
    if (!form) throw new NotFoundException('Request form not found');

    const fields = Array.isArray(form.form_fields)
      ? form.form_fields
      : (safeJsonParse(form.form_fields) || []);

    // Find a system user or the form creator as fallback author
    let authorId = form.created_by_id;
    if (!authorId) {
      // Fall back to first admin in the tenant
      const adminUser = await this.db('tenant_memberships')
        .where({ tenant_id: form.tenant_id, role: 'admin' })
        .join('users', 'tenant_memberships.user_id', 'users.id')
        .select('users.id')
        .first();
      if (adminUser) authorId = adminUser.id;
    }

    // Create a task from the form submission
    const taskId = uuidv4();
    const title = String(values['title'] || values['name'] || `Request: ${form.name}`);
    const [task] = await this.db('tasks')
      .insert({
        id: taskId,
        tenant_id: form.tenant_id,
        project_id: form.folder_id,
        created_by_id: authorId,
        title,
        description: JSON.stringify(values),
        custom_fields: JSON.stringify(values),
      })
      .returning('*');

    return task;
  }

  // ── Request Forms ─────────────────────────────────────────
  // Uses request_forms table (requires migration)

  async findRequestForms() {
    const ctx = requireTenantContext();
    return this.db('request_forms')
      .where({ tenant_id: ctx.tenantId })
      .orderBy('name', 'asc');
  }

  async createRequestForm(input: {
    name: string;
    description?: string;
    folderId: string;
    fields: Array<{ name: string; type: string; required: boolean; options?: string[] }>;
  }) {
    const ctx = requireTenantContext();
    const id = uuidv4();
    const [form] = await this.db('request_forms')
      .insert({
        id,
        tenant_id: ctx.tenantId,
        name: input.name,
        description: input.description || null,
        folder_id: input.folderId,
        form_fields: JSON.stringify(input.fields),
        created_by_id: ctx.userId,
      })
      .returning('*');
    return form;
  }

  async submitRequestForm(formId: string, values: Record<string, unknown>) {
    const ctx = requireTenantContext();
    const form = await this.db('request_forms')
      .where({ id: formId, tenant_id: ctx.tenantId })
      .first();
    if (!form) throw new NotFoundException('Request form not found');

    const fields = Array.isArray(form.form_fields)
      ? form.form_fields
      : (safeJsonParse(form.form_fields) || []);

    // Create a task from the form submission
    const taskId = uuidv4();
    const title = String(values['title'] || values['name'] || `Request: ${form.name}`);
    const [task] = await this.db('tasks')
      .insert({
        id: taskId,
        tenant_id: ctx.tenantId,
        project_id: form.folder_id,
        created_by_id: ctx.userId,
        title,
        description: JSON.stringify(values),
        custom_fields: JSON.stringify(values),
      })
      .returning('*');

    return task;
  }
}
