import { BadRequestException, Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { createDependencySchema, timelineQuerySchema, updateDependencySchema, updateTaskScheduleSchema } from '@wrike-clone/shared';
import { Permissions } from '../common/decorators/permissions.decorator';
import { AuthGuard } from '../common/guards/auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { TimelineService } from './timeline.service';
import { DependencyService } from './dependency.service';

function parseTimelineQuery(query: unknown) {
  const parsed = timelineQuerySchema.safeParse(query || {});
  if (!parsed.success) {
    throw new BadRequestException({
      statusCode: HttpStatus.BAD_REQUEST,
      message: 'Invalid timeline query',
      issues: parsed.error.issues.map((issue) => ({
        code: issue.code,
        path: issue.path.map(String),
        message: issue.message,
      })),
    });
  }
  return parsed.data;
}

@Controller()
@UseGuards(AuthGuard, RolesGuard)
export class TimelineController {
  constructor(
    private readonly timeline: TimelineService,
    private readonly dependencies: DependencyService,
  ) {}

  @Get('timeline')
  @Permissions('task:read')
  async dashboard(@Query() query: unknown) {
    return this.timeline.dashboard(parseTimelineQuery(query));
  }

  @Get('projects/:projectId/timeline')
  @Permissions('task:read')
  async project(@Param('projectId') projectId: string, @Query() query: unknown) {
    const { projectId: _untrustedProjectId, ...input } = parseTimelineQuery(query);
    return this.timeline.project(projectId, input);
  }

  @Patch('tasks/:taskId/schedule')
  @Permissions('task:write')
  async updateSchedule(@Param('taskId') taskId: string, @Body() body: unknown) {
    return this.timeline.updateSchedule(taskId, updateTaskScheduleSchema.parse(body));
  }

  @Post('tasks/dependencies')
  @Permissions('task:write')
  async createDependency(@Body() body: unknown) {
    return this.dependencies.create(createDependencySchema.parse(body));
  }

  @Patch('tasks/dependencies/:dependencyId')
  @Permissions('task:write')
  async updateDependency(@Param('dependencyId') dependencyId: string, @Body() body: unknown) {
    return this.dependencies.update(dependencyId, updateDependencySchema.parse(body));
  }

  @Delete('tasks/dependencies/:dependencyId')
  @Permissions('task:write')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeDependency(@Param('dependencyId') dependencyId: string) {
    await this.dependencies.remove(dependencyId);
  }
}
