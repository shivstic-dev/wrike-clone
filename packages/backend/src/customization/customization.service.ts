/**
 * Customization service — manages per-tenant custom workflows, item types,
 * blueprint templates (reusable project structures), and request forms.
 *
 * IMPORTANT: This service uses dedicated tables (workspace_statuses,
 * project_templates, request_forms) instead of piggybacking on non-existent
 * metadata columns. A migration must create these tables before use.
 */

import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  Inject,
  Logger,
} from '@nestjs/common';
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

const REQUEST_FIELD_TYPES = new Set(['text', 'textarea', 'number']);
const MAX_REQUEST_FIELDS = 50;
const MAX_FIELD_VALUE_LENGTH = 10_000;

export interface RequestFormField {
  name: string;
  type: 'text' | 'textarea' | 'number';
  required: boolean;
  options?: string[];
}

interface RequestFormRow {
  id: string;
  tenant_id: string;
  folder_id: string;
  created_by_id: string;
  name: string;
  description: string | null;
  form_fields: unknown;
  is_public: boolean;
}

interface RequestFormFolder {
  id: string;
  tenant_id: string;
  workspace_id: string;
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
    await this.db('custom_field_definitions').where({ id, tenant_id: ctx.tenantId }).del();
  }

  // ── Custom Item Types ──────────────────────────────────────
  // (Uses existing item_types table)

  async findItemTypes() {
    const ctx = requireTenantContext();
    return this.db('item_types').where({ tenant_id: ctx.tenantId }).orderBy('name', 'asc');
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
    await this.db('item_types').where({ id, tenant_id: ctx.tenantId }).del();
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
    return this.db('project_templates').where({ tenant_id: ctx.tenantId }).orderBy('name', 'asc');
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
        task_template: JSON.stringify(
          tasks.map((t: any) => ({
            title: t.title,
            description: t.description,
            priority: t.priority,
            estimated_hours: t.estimated_hours,
          })),
        ),
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
        priority: 'low',
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
        priority: t.priority || 'low',
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
      .where({ id: formId, is_public: true })
      .select(
        'id',
        'name',
        'description',
        'form_fields',
        'tenant_id',
        'folder_id',
        'created_by_id',
        'is_public',
      )
      .first<RequestFormRow>();
    if (!form) throw new NotFoundException('Request form not found');
    await this.requireAvailableFormFolder(form, this.db);

    return {
      id: form.id,
      name: form.name,
      description: form.description,
      fields: this.normalizeFieldDefinitions(form.form_fields),
    };
  }

  /**
   * Submit a request form from a public (unauthenticated) user.
   * Looks up the form to get tenant_id, folder_id, and uses a system
   * fallback for created_by since no authenticated user context exists.
   */
  async submitPublicRequestForm(formId: string, values: Record<string, unknown>) {
    return this.submitForm(formId, values);
  }

  // ── Request Forms ─────────────────────────────────────────
  // Uses request_forms table (requires migration)

  async findRequestForms() {
    const ctx = requireTenantContext();
    return this.db('request_forms').where({ tenant_id: ctx.tenantId }).orderBy('name', 'asc');
  }

  async createRequestForm(input: {
    name: string;
    description?: string;
    folderId: string;
    fields: Array<{ name: string; type: string; required: boolean; options?: string[] }>;
    isPublic?: boolean;
  }) {
    const ctx = requireTenantContext();
    const name = input.name?.trim();
    if (!name) throw new BadRequestException('Form name is required');
    if (name.length > 256) {
      throw new BadRequestException('Form name must be 256 characters or fewer');
    }
    const fields = this.normalizeFieldDefinitions(input.fields);
    const id = uuidv4();
    return this.db.transaction(async (trx) => {
      const folder = await trx('folders')
        .where({
          id: input.folderId,
          tenant_id: ctx.tenantId,
          is_archived: false,
        })
        .whereNull('deleted_at')
        .first();
      if (!folder) throw new NotFoundException('Folder not found');

      const [form] = await trx('request_forms')
        .insert({
          id,
          tenant_id: ctx.tenantId,
          name,
          description: input.description?.trim() || null,
          folder_id: input.folderId,
          form_fields: JSON.stringify(fields),
          created_by_id: ctx.userId,
          is_public: input.isPublic ?? false,
        })
        .returning('*');
      return form;
    });
  }

  async submitRequestForm(formId: string, values: Record<string, unknown>) {
    const ctx = requireTenantContext();
    return this.submitForm(formId, values, {
      tenantId: ctx.tenantId,
      authorId: ctx.userId,
    });
  }

  async updateRequestFormPublication(formId: string, isPublic: boolean) {
    const ctx = requireTenantContext();
    const [form] = await this.db('request_forms')
      .where({ id: formId, tenant_id: ctx.tenantId })
      .update({ is_public: isPublic })
      .returning('*');
    if (!form) throw new NotFoundException('Request form not found');
    return form;
  }

  private async submitForm(
    formId: string,
    values: unknown,
    authenticated?: { tenantId: string; authorId: string },
  ) {
    return this.db.transaction(async (trx) => {
      const query = trx('request_forms').where({ id: formId });
      if (authenticated) query.where({ tenant_id: authenticated.tenantId });
      const form = await query.first<RequestFormRow>();
      if (!form) throw new NotFoundException('Request form not found');
      if (!authenticated && !form.is_public) {
        throw new NotFoundException('Request form not found');
      }

      const folder = await this.requireAvailableFormFolder(form, trx);
      const fields = this.normalizeFieldDefinitions(form.form_fields);
      const normalizedValues = this.normalizeSubmissionValues(fields, values);
      const authorId = authenticated?.authorId || form.created_by_id;
      if (!authorId) {
        throw new InternalServerErrorException('Request form has no submission owner');
      }
      const project = await this.resolveInboxProject(form, authorId, trx);

      const taskId = uuidv4();
      const submittedTitle = normalizedValues['title'] ?? normalizedValues['name'];
      const title =
        typeof submittedTitle === 'string' && submittedTitle.trim()
          ? submittedTitle.trim()
          : `Request: ${form.name}`;
      const description =
        typeof normalizedValues['description'] === 'string'
          ? normalizedValues['description']
          : null;

      const [task] = await trx('tasks')
        .insert({
          id: taskId,
          tenant_id: form.tenant_id,
          project_id: project.id,
          department_id: folder.workspace_id,
          created_by_id: authorId,
          title,
          description,
          status: 'todo',
          priority: 'low',
          visibility: 'department',
          sort_order: 0,
          custom_fields: JSON.stringify(normalizedValues),
        })
        .returning('*');

      await trx('task_folder_links')
        .insert({
          tenant_id: form.tenant_id,
          task_id: taskId,
          folder_id: folder.id,
          is_home: true,
        })
        .onConflict(['task_id', 'folder_id'])
        .merge({ is_home: true });

      return task;
    });
  }

  private async requireAvailableFormFolder(
    form: Pick<RequestFormRow, 'folder_id' | 'tenant_id'>,
    database: Knex | Knex.Transaction,
  ): Promise<RequestFormFolder> {
    const folder = await database('folders')
      .where({
        id: form.folder_id,
        tenant_id: form.tenant_id,
        is_archived: false,
      })
      .whereNull('deleted_at')
      .first<RequestFormFolder>();
    if (!folder) throw new NotFoundException('Request form not found');
    return folder;
  }

  private async resolveInboxProject(
    form: Pick<RequestFormRow, 'tenant_id' | 'folder_id'>,
    ownerId: string,
    trx: Knex.Transaction,
  ): Promise<{ id: string }> {
    const read = () =>
      trx('projects')
        .where({
          tenant_id: form.tenant_id,
          folder_id: form.folder_id,
          is_system: true,
        })
        .whereNull('deleted_at')
        .first<{ id: string }>();

    let project = await read();
    if (!project) {
      await trx('projects')
        .insert({
          id: uuidv4(),
          tenant_id: form.tenant_id,
          folder_id: form.folder_id,
          owner_id: ownerId,
          name: 'General Tasks',
          description: 'Automatic project for direct tasks',
          status: 'active',
          priority: 'low',
          visibility: 'department',
          is_system: true,
        })
        .onConflict()
        .ignore();
      project = await read();
    }
    if (!project) {
      throw new InternalServerErrorException('Request inbox project could not be provisioned');
    }
    return project;
  }

  private normalizeFieldDefinitions(value: unknown): RequestFormField[] {
    let fields: unknown = value;
    if (typeof fields === 'string') {
      try {
        fields = JSON.parse(fields);
      } catch {
        throw new BadRequestException('Request form configuration is invalid');
      }
    }
    if (!Array.isArray(fields)) {
      throw new BadRequestException('Request form fields must be an array');
    }
    if (fields.length > MAX_REQUEST_FIELDS) {
      throw new BadRequestException(`Request forms support at most ${MAX_REQUEST_FIELDS} fields`);
    }

    const normalized = fields.map((candidate, index): RequestFormField => {
      if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
        throw new BadRequestException(`Field ${index + 1} is invalid`);
      }
      const raw = candidate as Record<string, unknown>;
      const name = typeof raw['name'] === 'string' ? raw['name'].trim() : '';
      if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(name)) {
        throw new BadRequestException(
          `Field ${index + 1} name must start with a letter and contain only letters, numbers, or underscores`,
        );
      }
      if (typeof raw['type'] !== 'string' || !REQUEST_FIELD_TYPES.has(raw['type'])) {
        throw new BadRequestException(`Field "${name}" has an unsupported type`);
      }
      if (typeof raw['required'] !== 'boolean') {
        throw new BadRequestException(`Field "${name}" must declare whether it is required`);
      }

      let options: string[] | undefined;
      if (raw['options'] !== undefined) {
        if (
          raw['type'] !== 'text' ||
          !Array.isArray(raw['options']) ||
          raw['options'].length === 0
        ) {
          throw new BadRequestException(`Field "${name}" options are invalid`);
        }
        options = raw['options'].map((option) => {
          if (typeof option !== 'string' || !option.trim() || option.length > 200) {
            throw new BadRequestException(`Field "${name}" options are invalid`);
          }
          return option.trim();
        });
        if (new Set(options).size !== options.length) {
          throw new BadRequestException(`Field "${name}" options must be unique`);
        }
      }

      return {
        name,
        type: raw['type'] as RequestFormField['type'],
        required: raw['required'],
        ...(options ? { options } : {}),
      };
    });

    const names = normalized.map((field) => field.name);
    if (new Set(names).size !== names.length) {
      throw new BadRequestException('Field names must be unique');
    }
    return normalized;
  }

  private normalizeSubmissionValues(
    fields: RequestFormField[],
    value: unknown,
  ): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException('Submission values must be an object');
    }
    const values = value as Record<string, unknown>;
    const declaredNames = new Set(fields.map((field) => field.name));
    for (const name of Object.keys(values)) {
      if (!declaredNames.has(name)) {
        throw new BadRequestException(`Unknown field "${name}"`);
      }
    }

    const normalized: Record<string, unknown> = {};
    for (const field of fields) {
      const rawValue = values[field.name];
      const isEmpty =
        rawValue === undefined ||
        rawValue === null ||
        (typeof rawValue === 'string' && rawValue.trim() === '');
      if (isEmpty) {
        if (field.required) {
          throw new BadRequestException(`Field "${field.name}" is required`);
        }
        continue;
      }

      if (field.type === 'number') {
        const numberValue =
          typeof rawValue === 'number'
            ? rawValue
            : typeof rawValue === 'string'
              ? Number(rawValue)
              : Number.NaN;
        if (!Number.isFinite(numberValue)) {
          throw new BadRequestException(`Field "${field.name}" must be a number`);
        }
        normalized[field.name] = numberValue;
        continue;
      }

      if (typeof rawValue !== 'string') {
        throw new BadRequestException(`Field "${field.name}" must be text`);
      }
      if (rawValue.length > MAX_FIELD_VALUE_LENGTH) {
        throw new BadRequestException(
          `Field "${field.name}" must be ${MAX_FIELD_VALUE_LENGTH} characters or fewer`,
        );
      }
      const textValue = rawValue.trim();
      if (field.options && !field.options.includes(textValue)) {
        throw new BadRequestException(`Field "${field.name}" has an invalid option`);
      }
      normalized[field.name] = textValue;
    }
    return normalized;
  }
}
