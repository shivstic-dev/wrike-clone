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
} from '@wrike-clone/shared';

@Controller('tasks')
@UseGuards(AuthGuard, RolesGuard)
export class TaskController {
  constructor(private readonly taskService: TaskService) {}

  @Get()
  @Permissions('task:read')
  async findAll(@Query() query: unknown) {
    const filter = taskFilterSchema.parse(query || {});
    return this.taskService.findAll(filter);
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
