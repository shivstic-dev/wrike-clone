import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { changeDepartmentMemberRoleSchema } from '@wrike-clone/shared';
import { Permissions } from '../common/decorators/permissions.decorator';
import { AuthGuard } from '../common/guards/auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { WorkspaceService } from '../workspace/workspace.service';
import { TaskLocationService } from './task-location.service';
import { TaskService } from './task.service';

@Controller('departments')
@UseGuards(AuthGuard, RolesGuard)
export class DepartmentWorkflowController {
  constructor(
    private readonly taskService: TaskService,
    private readonly workspaceService: WorkspaceService,
    private readonly taskLocations: TaskLocationService,
  ) {}

  @Get(':id/tasks/grouped')
  @Permissions('task:read')
  async groupedTasks(@Param('id') id: string) {
    return this.taskService.findDepartmentTasksGrouped(id);
  }

  @Get(':id/task-locations')
  @Permissions('task:read')
  async listLocations(@Param('id') id: string) {
    return this.taskLocations.listDepartmentLocations(id);
  }

  @Patch(':id/members/:userId/role')
  @Permissions('workspace:read')
  async changeRole(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Body() body: unknown,
  ) {
    const input = changeDepartmentMemberRoleSchema.parse(body);
    return this.workspaceService.changeDepartmentMemberRole(id, userId, input.role);
  }

  @Get(':id/role-changes')
  @Permissions('workspace:read')
  async roleChanges(@Param('id') id: string) {
    return this.workspaceService.findRoleChangeLog(id);
  }
}
