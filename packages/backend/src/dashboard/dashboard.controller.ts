import {
  BadRequestException,
  Controller,
  Get,
  HttpStatus,
  Query,
  UseGuards,
} from '@nestjs/common';
import { dashboardOverviewQuerySchema, dashboardTasksQuerySchema } from '@wrike-clone/shared';
import { Permissions } from '../common/decorators/permissions.decorator';
import { AuthGuard } from '../common/guards/auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
@UseGuards(AuthGuard, RolesGuard)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('overview')
  @Permissions('task:read')
  async overview(@Query() query: unknown) {
    const parsed = dashboardOverviewQuerySchema.safeParse(query || {});
    if (!parsed.success) {
      throw new BadRequestException({
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Invalid dashboard query',
        issues: parsed.error.issues.map((issue) => ({
          code: issue.code,
          path: issue.path.map(String),
          message: issue.message,
        })),
      });
    }
    return this.dashboard.overview(parsed.data);
  }

  @Get('tasks')
  @Permissions('task:read')
  async tasks(@Query() query: unknown) {
    const parsed = dashboardTasksQuerySchema.safeParse(query || {});
    if (!parsed.success) {
      throw new BadRequestException({
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Invalid dashboard query',
        issues: parsed.error.issues.map((issue) => ({
          code: issue.code,
          path: issue.path.map(String),
          message: issue.message,
        })),
      });
    }
    return this.dashboard.tasks(parsed.data);
  }
}
