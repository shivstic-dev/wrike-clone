/**
 * Task controller — REST endpoints for task CRUD and related operations.
 */

import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { TaskService } from './task.service';
import { TaskCompletionService } from './task-completion.service';
import { AuthGuard } from '../common/guards/auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Permissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
  createTaskSchema,
  updateTaskSchema,
  taskFilterSchema,
  bulkTaskUpdateSchema,
  createDependencySchema,
  createCommentSchema,
  addTaskAssigneeSchema,
  moveTaskLocationSchema,
  taskCompletionSchema,
  bulkTaskCompletionSchema,
} from '@wrike-clone/shared';

@Controller('tasks')
@UseGuards(AuthGuard, RolesGuard)
export class TaskController {
  constructor(
    private readonly taskService: TaskService,
    private readonly taskCompletionService: TaskCompletionService,
  ) {}

  @Get()
  @Permissions('task:read')
  async findAll(@Query() query: unknown) {
    const filter = taskFilterSchema.parse(query || {});
    return this.taskService.findAll(filter);
  }

  @Get('my')
  @Permissions('task:read')
  async findMy(@Query() query: unknown) {
    const filter = taskFilterSchema.parse(query || {});
    return this.taskService.findMyTasks(filter);
  }

  @Post('bulk-completion')
  @Permissions('task:status:update')
  async completeMany(@Body() body: unknown) {
    const input = bulkTaskCompletionSchema.parse(body);
    return this.taskCompletionService.completeMany(input);
  }

  @Post(':taskId/completion')
  @Permissions('task:status:update')
  async complete(@Param('taskId') taskId: string, @Body() body: unknown) {
    const input = taskCompletionSchema.parse(body);
    return this.taskCompletionService.complete(taskId, input);
  }


  @Post(':id/assignees')
  @Permissions('task:read')
  async addAssignee(@Param('id') id: string, @Body() body: unknown) {
    const input = addTaskAssigneeSchema.parse(body);
    return this.taskService.addAssignee(id, input.userId);
  }

  @Delete(':id/assignees/:userId')
  @Permissions('task:read')
  async removeAssignee(@Param('id') id: string, @Param('userId') userId: string) {
    return this.taskService.removeAssignee(id, userId);
  }

  @Get(':id/comments')
  @Permissions('task:read')
  async findComments(@Param('id') id: string) {
    return this.taskService.findComments(id);
  }

  @Post(':id/comments')
  @Permissions('task:comment')
  async addTaskComment(@Param('id') id: string, @Body() body: unknown) {
    const input = createCommentSchema.parse({
      ...(body as Record<string, unknown>),
      taskId: id,
    });
    return this.taskService.addComment(input);
  }

  @Get('stats')
  @Permissions('task:read')
  async getDashboardStats() {
    return this.taskService.getDashboardStats();
  }

  @Get(':id')
  @Permissions('task:read')
  async findOne(@Param('id') id: string) {
    return this.taskService.findById(id);
  }

  @Post()
  @Permissions('task:read')
  async create(@Body() body: unknown) {
    const input = createTaskSchema.parse(body);
    return this.taskService.create(input);
  }

  @Patch(':id')
  @Permissions('task:read')
  async update(@Param('id') id: string, @Body() body: unknown) {
    const input = updateTaskSchema.parse(body);
    return this.taskService.update(id, input);
  }

  @Patch(':taskId/location')
  @Permissions('task:read')
  async moveLocation(@Param('taskId') taskId: string, @Body() body: unknown) {
    return this.taskService.moveLocation(taskId, moveTaskLocationSchema.parse(body));
  }

  @Delete(':id')
  @Permissions('task:read')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string) {
    await this.taskService.remove(id);
  }

  @Post('bulk-update')
  @Permissions('task:read')
  async bulkUpdate(@Body() body: unknown) {
    const input = bulkTaskUpdateSchema.parse(body);
    return this.taskService.bulkUpdate(input);
  }

  @Post('dependencies')
  @Permissions('task:read')
  async createDependency(@Body() body: unknown) {
    const input = createDependencySchema.parse(body);
    return this.taskService.createDependency(input);
  }

  @Delete('dependencies/:id')
  @Permissions('task:read')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeDependency(@Param('id') id: string) {
    await this.taskService.removeDependency(id);
  }

  @Post('comments')
  @Permissions('task:comment')
  async addComment(@Body() body: unknown) {
    const input = createCommentSchema.parse(body);
    return this.taskService.addComment(input);
  }
}
