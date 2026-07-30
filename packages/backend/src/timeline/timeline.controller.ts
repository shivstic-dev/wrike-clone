import { BadRequestException, Controller, Get, HttpStatus, Param, Query, UseGuards } from '@nestjs/common';
import { timelineQuerySchema } from '@wrike-clone/shared';
import { Permissions } from '../common/decorators/permissions.decorator';
import { AuthGuard } from '../common/guards/auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { TimelineService } from './timeline.service';

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
  constructor(private readonly timeline: TimelineService) {}

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
}
