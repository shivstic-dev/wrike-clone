import { Module } from '@nestjs/common';
import { TaskService } from './task.service';
import { TaskController } from './task.controller';
import { RbacModule } from '../rbac/rbac.module';
import { WorkspaceModule } from '../workspace/workspace.module';
import { DepartmentWorkflowController } from './department-workflow.controller';
import { TaskLocationService } from './task-location.service';

@Module({
  imports: [RbacModule, WorkspaceModule],
  controllers: [TaskController, DepartmentWorkflowController],
  providers: [TaskService, TaskLocationService],
  exports: [TaskService, TaskLocationService],
})
export class TaskModule {}
