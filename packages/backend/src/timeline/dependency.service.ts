import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  type CreateDependencyInput,
  type TaskDependency,
  type UpdateDependencyInput,
} from '@wrike-clone/shared';
import type { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';
import { requireTenantContext } from '../common/tenant-context';
import { DATABASE_PROVIDER } from '../database/database.module';
import { DepartmentAccessService } from '../rbac/department-access.service';
import { type DependencyEdge, wouldCreateCycle } from './dependency-graph';

type DependencyRow = {
  id: string;
  task_id: string;
  depends_on_task_id: string;
  dependency_type: TaskDependency['dependencyType'];
  lag_days: number | string;
};

@Injectable()
export class DependencyService {
  constructor(
    @Inject(DATABASE_PROVIDER) private readonly db: Knex,
    private readonly departmentAccess: DepartmentAccessService,
  ) {}

  async create(input: CreateDependencyInput): Promise<TaskDependency> {
    const ctx = requireTenantContext();
    return this.db.transaction(async (trx) => {
      const [task, predecessor] = await Promise.all([
        this.findTask(trx, input.taskId),
        this.findTask(trx, input.dependsOnTaskId),
      ]);
      if (!task || !predecessor) throw new NotFoundException('Task not found');
      await this.assertCanManage(task.department_id);
      await this.assertCanManage(predecessor.department_id);

      const candidate: DependencyEdge = {
        taskId: input.taskId,
        dependsOnTaskId: input.dependsOnTaskId,
        dependencyType: input.dependencyType,
        lagDays: input.lagDays,
      };
      const edges = await this.edges(trx);
      if (edges.some((edge) => edge.taskId === candidate.taskId && edge.dependsOnTaskId === candidate.dependsOnTaskId)) {
        throw new ConflictException({ code: 'DEPENDENCY_EXISTS', message: 'These tasks are already linked.' });
      }
      if (wouldCreateCycle(edges, candidate)) {
        throw new ConflictException({ code: 'DEPENDENCY_CYCLE', message: 'This dependency would create a cycle.' });
      }

      const [row] = await trx('task_dependencies')
        .insert({
          id: uuidv4(),
          tenant_id: ctx.tenantId,
          task_id: candidate.taskId,
          depends_on_task_id: candidate.dependsOnTaskId,
          dependency_type: candidate.dependencyType,
          lag_days: candidate.lagDays,
        })
        .returning('*');
      return this.toDependency(row);
    });
  }

  async update(id: string, input: UpdateDependencyInput): Promise<TaskDependency> {
    return this.db.transaction(async (trx) => {
      const dependency = await this.findDependency(trx, id);
      if (!dependency) throw new NotFoundException('Dependency not found');
      const [task, predecessor] = await Promise.all([
        this.findTask(trx, dependency.task_id),
        this.findTask(trx, dependency.depends_on_task_id),
      ]);
      if (!task || !predecessor) throw new NotFoundException('Task not found');
      await this.assertCanManage(task.department_id);
      await this.assertCanManage(predecessor.department_id);

      const candidate: DependencyEdge = {
        taskId: dependency.task_id,
        dependsOnTaskId: dependency.depends_on_task_id,
        dependencyType: input.dependencyType,
        lagDays: input.lagDays,
      };
      const edges = (await this.edges(trx)).filter((edge) => edge.id !== id);
      if (wouldCreateCycle(edges, candidate)) {
        throw new ConflictException({ code: 'DEPENDENCY_CYCLE', message: 'This dependency would create a cycle.' });
      }

      const [row] = await trx('task_dependencies')
        .where({ id, tenant_id: requireTenantContext().tenantId })
        .update({ dependency_type: input.dependencyType, lag_days: input.lagDays, updated_at: new Date() })
        .returning('*');
      if (!row) throw new NotFoundException('Dependency not found');
      return this.toDependency(row);
    });
  }

  async remove(id: string): Promise<void> {
    return this.db.transaction(async (trx) => {
      const dependency = await this.findDependency(trx, id);
      if (!dependency) throw new NotFoundException('Dependency not found');
      const task = await this.findTask(trx, dependency.task_id);
      if (!task) throw new NotFoundException('Task not found');
      await this.assertCanManage(task.department_id);
      await trx('task_dependencies').where({ id, tenant_id: requireTenantContext().tenantId }).del();
    });
  }

  private async findTask(trx: Knex, id: string): Promise<Record<string, any> | undefined> {
    return trx('tasks')
      .where({ id, tenant_id: requireTenantContext().tenantId })
      .whereNull('deleted_at')
      .first();
  }

  private async findDependency(trx: Knex, id: string): Promise<DependencyRow | undefined> {
    return trx('task_dependencies')
      .where({ id, tenant_id: requireTenantContext().tenantId })
      .first();
  }

  private async edges(trx: Knex): Promise<Array<DependencyEdge & { id: string }>> {
    const rows = await trx('task_dependencies')
      .where({ tenant_id: requireTenantContext().tenantId })
      .select('id', 'task_id', 'depends_on_task_id', 'dependency_type', 'lag_days');
    return (rows as DependencyRow[]).map((row) => ({
      id: row.id,
      taskId: row.task_id,
      dependsOnTaskId: row.depends_on_task_id,
      dependencyType: row.dependency_type,
      lagDays: Number(row.lag_days),
    }));
  }

  private async assertCanManage(departmentId: string): Promise<void> {
    try {
      await this.departmentAccess.assertCanManageTask(departmentId);
    } catch (error) {
      if (error instanceof ForbiddenException) {
        throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Dependency management is not permitted.' });
      }
      throw error;
    }
  }

  private toDependency(row: DependencyRow): TaskDependency {
    return {
      id: row.id,
      taskId: row.task_id,
      dependsOnTaskId: row.depends_on_task_id,
      dependencyType: row.dependency_type,
      lagDays: Number(row.lag_days),
    };
  }
}
