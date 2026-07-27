import { Module } from '@nestjs/common';
import { TaskService } from './task.service';
import { TaskController } from './task.controller';
import { RbacModule } from '../rbac/rbac.module';
import { WorkspaceModule } from '../workspace/workspace.module';
import { DepartmentWorkflowController } from './department-workflow.controller';

@Module({
  imports: [RbacModule, WorkspaceModule],
  controllers: [TaskController, DepartmentWorkflowController],
  providers: [TaskService],
  exports: [TaskService],
})
export class TaskModule {}
