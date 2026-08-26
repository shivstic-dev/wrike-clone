/**
 * Folder service — recursive hierarchy (Spaces > Folders > Projects container).
 */

import { Injectable, NotFoundException, ForbiddenException, Inject, Logger } from '@nestjs/common';
import { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';
import { DATABASE_PROVIDER } from '../database/database.module';
import { requireTenantContext } from '../common/tenant-context';
import { applyFolderVisibilityScope } from '../common/visibility.scope';
import type { CreateFolderInput, UpdateFolderRequest } from '@wrike-clone/shared';

@Injectable()
export class FolderService {
  private readonly logger = new Logger(FolderService.name);

  constructor(@Inject(DATABASE_PROVIDER) private readonly db: Knex) {}

  async findByWorkspace(workspaceId: string) {
    const ctx = requireTenantContext();
    const query = this.db('folders')
      .where({ workspace_id: workspaceId, tenant_id: ctx.tenantId, deleted_at: null })
      .orderBy('sort_order', 'asc');

    return applyFolderVisibilityScope(query, ctx);
  }

  async findById(id: string) {
    const ctx = requireTenantContext();
    const folder = await this.db('folders')
      .where({ id, tenant_id: ctx.tenantId, deleted_at: null })
      .modify((qb) => {
        if (ctx.role !== 'admin') applyFolderVisibilityScope(qb, ctx);
      })
      .first();
    if (!folder) throw new NotFoundException('Folder not found');
    return folder;
  }

  async create(input: CreateFolderInput) {
    const ctx = requireTenantContext();

    // Verify workspace exists
    const ws = await this.db('workspaces')
      .where({ id: input.workspaceId, tenant_id: ctx.tenantId })
      .first();
    if (!ws) throw new NotFoundException('Workspace not found');

    // If parent specified, verify it exists
    if (input.parentFolderId) {
      const parent = await this.findById(input.parentFolderId);
      if (!parent) throw new NotFoundException('Parent folder not found');
    }

    const id = uuidv4();
    const [folder] = await this.db('folders')
      .insert({
        id,
        tenant_id: ctx.tenantId,
        workspace_id: input.workspaceId,
        parent_folder_id: input.parentFolderId || null,
        name: input.name,
        description: input.description || null,
        icon: input.icon || null,
      })
      .returning('*');
    this.logger.log(`Folder ${id} created in workspace ${input.workspaceId}`);
    return folder;
  }

  async update(id: string, input: UpdateFolderRequest) {
    const ctx = requireTenantContext();
    const existing = await this.findById(id);
    if (existing.is_system_general) {
      throw new ForbiddenException('The General folder is managed by the system');
    }
    const updates: Record<string, unknown> = {};
    if (input.name !== undefined) updates['name'] = input.name;
    if (input.description !== undefined) updates['description'] = input.description;
    if (input.icon !== undefined) updates['icon'] = input.icon;
    if (input.isArchived !== undefined) updates['is_archived'] = input.isArchived;

    const [folder] = await this.db('folders')
      .where({ id, tenant_id: ctx.tenantId })
      .update(updates)
      .returning('*');
    return folder;
  }

  async remove(id: string): Promise<void> {
    const ctx = requireTenantContext();
    const existing = await this.findById(id);
    if (existing.is_system_general) {
      throw new ForbiddenException('The General folder is managed by the system');
    }
    await this.db('folders')
      .where({ id, tenant_id: ctx.tenantId })
      .update({ deleted_at: new Date() });
    this.logger.log(`Folder ${id} deleted`);
  }
}
