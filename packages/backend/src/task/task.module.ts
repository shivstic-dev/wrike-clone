import { Module } from '@nestjs/common';
import { TaskService } from './task.service';
import { TaskCompletionService } from './task-completion.service';
import { TaskController } from './task.controller';
import { RbacModule } from '../rbac/rbac.module';
import { WorkspaceModule } from '../workspace/workspace.module';
import { DepartmentWorkflowController } from './department-workflow.controller';
import { TaskLocationService } from './task-location.service';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [RbacModule, WorkspaceModule, NotificationModule],
  controllers: [TaskController, DepartmentWorkflowController],
  providers: [TaskService, TaskCompletionService, TaskLocationService],
  exports: [TaskService, TaskCompletionService, TaskLocationService],
})
export class TaskModule {}

