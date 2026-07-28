import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import type {
  MoveTaskLocationInput,
  TaskLocationInput,
  TaskLocationOption,
} from '@wrike-clone/shared';
import type { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';
import { requireTenantContext } from '../common/tenant-context';
import { applyFolderVisibilityScope, applyVisibilityScope } from '../common/visibility.scope';
import { DATABASE_PROVIDER } from '../database/database.module';
import { DepartmentAccessService } from '../rbac/department-access.service';
import type { ResolvedTaskLocation, TaskLocationFolderRow } from './task-location.types';

@Injectable()
export class TaskLocationService {
  constructor(
    @Inject(DATABASE_PROVIDER) private readonly db: Knex,
    private readonly departmentAccess: DepartmentAccessService,
  ) {}

  async resolveForCreate(
    input: TaskLocationInput,
    trx: Knex.Transaction,
  ): Promise<ResolvedTaskLocation> {
    if (input.projectId) {
      const destination = await this.resolveProject(
        input.projectId,
        input.departmentId,
        input.folderId,
        trx,
      );
      await this.departmentAccess.assertCanCreateTask(destination.departmentId);
      return destination;
    }

    const departmentId = input.departmentId!;
    await this.departmentAccess.assertCanCreateTask(departmentId);
    const folder = input.folderId
      ? await this.requireFolder(input.folderId, departmentId, trx)
      : await this.getOrCreateGeneralFolder(departmentId, trx);
    return this.resolveSystemProject(folder, trx);
  }

  async resolveForMove(
    departmentId: string,
    input: MoveTaskLocationInput,
    trx: Knex.Transaction,
  ): Promise<ResolvedTaskLocation> {
    if (input.projectId) {
      return this.resolveProject(input.projectId, departmentId, input.folderId, trx);
    }
    const folder = await this.requireFolder(input.folderId!, departmentId, trx);
    return this.resolveSystemProject(folder, trx);
  }

  async writeHomeLink(taskId: string, folderId: string, trx: Knex.Transaction): Promise<void> {
    const ctx = requireTenantContext();
    await trx('task_folder_links')
      .where({ tenant_id: ctx.tenantId, task_id: taskId, is_home: true })
      .del();
    await trx('task_folder_links').insert({
      tenant_id: ctx.tenantId,
      task_id: taskId,
      folder_id: folderId,
      is_home: true,
    });
  }

  async listDepartmentLocations(departmentId: string): Promise<TaskLocationOption[]> {
    await this.departmentAccess.assertCanViewDepartment(departmentId);
    const ctx = requireTenantContext();
    const folderQuery = this.db('folders')
      .where({
        tenant_id: ctx.tenantId,
        workspace_id: departmentId,
        deleted_at: null,
        is_archived: false,
      })
      .orderBy('is_system_general', 'desc')
      .orderBy('sort_order', 'asc');
    applyFolderVisibilityScope(folderQuery, ctx);
    const folders = await folderQuery;

    const projectQuery = this.db('projects')
      .join('folders', 'folders.id', 'projects.folder_id')
      .where('projects.tenant_id', ctx.tenantId)
      .where('folders.tenant_id', ctx.tenantId)
      .where('folders.workspace_id', departmentId)
      .where('folders.is_archived', false)
      .where('projects.is_system', false)
      .whereNull('projects.deleted_at')
      .whereNull('folders.deleted_at')
      .select('projects.id', 'projects.name', 'projects.folder_id');
    applyVisibilityScope(projectQuery, ctx, 'folders.workspace_id', 'projects.visibility');
    const projects = await projectQuery;

    return folders.map((folder) => ({
      folderId: folder.id,
      folderName: folder.name,
      isGeneral: folder.is_system_general,
      projects: projects
        .filter((project) => project.folder_id === folder.id)
        .map((project) => ({
          projectId: project.id,
          projectName: project.name,
        })),
    }));
  }

  async move(taskId: string, input: MoveTaskLocationInput): Promise<void> {
    const ctx = requireTenantContext();
    await this.db.transaction(async (trx) => {
      const task = await this.requireTaskWithLocation(taskId, trx, {
        forUpdate: true,
      });
      await this.departmentAccess.assertCanManageTask(task.department_id);
      const destination = await this.resolveForMove(task.department_id, input, trx);

      await trx('tasks')
        .where({ id: taskId, tenant_id: ctx.tenantId })
        .update({ project_id: destination.projectId, updated_at: new Date() });
      await this.writeHomeLink(taskId, destination.folderId, trx);
      await trx('activity_logs').insert({
        id: uuidv4(),
        tenant_id: ctx.tenantId,
        actor_id: ctx.userId,
        entity_type: 'task',
        entity_id: taskId,
        action: 'task:location:changed',
        changes: JSON.stringify({
          old: { folderId: task.folder_id, projectId: task.project_id },
          new: {
            folderId: destination.folderId,
            projectId: destination.projectId,
          },
        }),
        metadata: '{}',
      });
    });
  }

  private async getOrCreateGeneralFolder(
    departmentId: string,
    trx: Knex.Transaction,
  ): Promise<TaskLocationFolderRow> {
    const ctx = requireTenantContext();
    const read = () =>
      trx('folders')
        .where({
          tenant_id: ctx.tenantId,
          workspace_id: departmentId,
          is_system_general: true,
          is_archived: false,
        })
        .whereNull('deleted_at')
        .first<TaskLocationFolderRow>();

    const existing = await read();
    if (existing) return existing;

    await trx('folders')
      .insert({
        id: uuidv4(),
        tenant_id: ctx.tenantId,
        workspace_id: departmentId,
        parent_folder_id: null,
        name: 'General',
        description: 'Tasks created without a selected folder',
        is_system_general: true,
        is_archived: false,
        sort_order: 0,
      })
      .onConflict()
      .ignore();
    const winner = await read();
    if (!winner) {
      throw new InternalServerErrorException('General folder could not be provisioned');
    }
    return winner;
  }

  private async resolveSystemProject(
    folder: TaskLocationFolderRow,
    trx: Knex.Transaction,
  ): Promise<ResolvedTaskLocation> {
    const ctx = requireTenantContext();
    const read = () =>
      trx('projects')
        .where({
          tenant_id: ctx.tenantId,
          folder_id: folder.id,
          is_system: true,
        })
        .whereNull('deleted_at')
        .first<{ id: string; name: string }>();

    let project = await read();
    if (!project) {
      await trx('projects')
        .insert({
          id: uuidv4(),
          tenant_id: ctx.tenantId,
          folder_id: folder.id,
          owner_id: ctx.userId,
          name: 'General Tasks',
          description: 'Automatic project for direct tasks',
          visibility: 'department',
          is_system: true,
        })
        .onConflict()
        .ignore();
      project = await read();
    }
    if (!project) {
      throw new InternalServerErrorException('System project could not be provisioned');
    }

    return {
      departmentId: folder.workspace_id,
      folderId: folder.id,
      folderName: folder.name,
      projectId: project.id,
      projectName: project.name,
      isSystemProject: true,
    };
  }

  private async requireFolder(
    folderId: string,
    departmentId: string,
    trx: Knex.Transaction,
  ): Promise<TaskLocationFolderRow> {
    const ctx = requireTenantContext();
    const query = trx('folders')
      .where({
        id: folderId,
        tenant_id: ctx.tenantId,
        is_archived: false,
      })
      .whereNull('deleted_at');
    applyFolderVisibilityScope(query, ctx);
    const folder = await query.first<TaskLocationFolderRow>();
    if (!folder) throw new NotFoundException('Folder not found');
    if (folder.workspace_id !== departmentId) {
      throw new ForbiddenException('Destination must belong to the current department');
    }
    return folder;
  }

  private async resolveProject(
    projectId: string,
    departmentId: string | undefined,
    folderId: string | undefined,
    trx: Knex.Transaction,
  ): Promise<ResolvedTaskLocation> {
    const ctx = requireTenantContext();
    const query = trx('projects')
      .join('folders', 'folders.id', 'projects.folder_id')
      .where('projects.id', projectId)
      .where('projects.tenant_id', ctx.tenantId)
      .where('folders.tenant_id', ctx.tenantId)
      .where('projects.is_system', false)
      .where('folders.is_archived', false)
      .whereNull('projects.deleted_at')
      .whereNull('folders.deleted_at')
      .select(
        'projects.*',
        'folders.id as resolved_folder_id',
        'folders.name as folder_name',
        'folders.workspace_id as department_id',
      );
    applyVisibilityScope(query, ctx, 'folders.workspace_id', 'projects.visibility');
    const project = await query.first<{
      id: string;
      name: string;
      resolved_folder_id: string;
      folder_name: string;
      department_id: string;
    }>();
    if (!project) throw new NotFoundException('Project not found');
    if (departmentId && project.department_id !== departmentId) {
      throw new ForbiddenException('Destination must belong to the current department');
    }
    if (folderId && project.resolved_folder_id !== folderId) {
      throw new BadRequestException('Project does not belong to the selected folder');
    }

    return {
      departmentId: project.department_id,
      folderId: project.resolved_folder_id,
      folderName: project.folder_name,
      projectId: project.id,
      projectName: project.name,
      isSystemProject: false,
    };
  }

  private async requireTaskWithLocation(
    taskId: string,
    trx: Knex | Knex.Transaction = this.db,
    options: { forUpdate?: boolean } = {},
  ): Promise<{
    id: string;
    project_id: string;
    folder_id: string;
    department_id: string;
  }> {
    const ctx = requireTenantContext();
    const query = trx('tasks')
      .leftJoin({ home_link: 'task_folder_links' }, function () {
        this.on('home_link.task_id', '=', 'tasks.id')
          .andOn('home_link.tenant_id', '=', 'tasks.tenant_id')
          .andOnVal('home_link.is_home', '=', true);
      })
      .where('tasks.id', taskId)
      .where('tasks.tenant_id', ctx.tenantId)
      .whereNull('tasks.deleted_at')
      .select('tasks.*', 'home_link.folder_id');
    if (options.forUpdate) query.forUpdate('tasks');
    const task = await query.first<{
      id: string;
      project_id: string;
      folder_id?: string;
    }>();
    if (!task) throw new NotFoundException('Task not found');
    if (!task.folder_id) {
      throw new InternalServerErrorException('Task home location not found');
    }

    const homeFolder = await trx('folders')
      .where({
        id: task.folder_id,
        tenant_id: ctx.tenantId,
      })
      .first<{ workspace_id: string }>();
    if (!homeFolder) {
      throw new InternalServerErrorException('Task home location not found');
    }
    return {
      ...task,
      folder_id: task.folder_id,
      department_id: homeFolder.workspace_id,
    };
  }
}
