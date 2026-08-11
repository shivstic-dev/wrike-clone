import {
  BadRequestException,
  Controller,
  Get,
  HttpStatus,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  dashboardAnalyticsQuerySchema,
  dashboardAnalyticsExportQuerySchema,
  dashboardOverviewQuerySchema,
  dashboardTasksQuerySchema,
} from '@wrike-clone/shared';
import type { Response } from 'express';
import { Res } from '@nestjs/common';
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

  @Get('analytics')
  @Permissions('task:read')
  async analytics(@Query() query: unknown) {
    const parsed = dashboardAnalyticsQuerySchema.safeParse(query || {});
    if (!parsed.success) {
      throw new BadRequestException({
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Invalid dashboard analytics query',
        issues: parsed.error.issues.map((issue) => ({
          code: issue.code,
          path: issue.path.map(String),
          message: issue.message,
        })),
      });
    }
    return this.dashboard.analytics(parsed.data);
  }

  @Get('analytics/export')
  @Permissions('task:read')
  async exportAnalytics(@Query() query: unknown, @Res() response: Response): Promise<void> {
    const parsed = dashboardAnalyticsExportQuerySchema.safeParse(query || {});
    if (!parsed.success) {
      throw new BadRequestException({
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Invalid dashboard analytics export query',
        issues: parsed.error.issues.map((issue) => ({
          code: issue.code,
          path: issue.path.map(String),
          message: issue.message,
        })),
      });
    }
    const result = await this.dashboard.analyticsExport(parsed.data);
    response.setHeader('Content-Type', result.contentType);
    response.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    response.setHeader('Cache-Control', 'private, no-store');
    response.send(result.buffer);
  }
}
