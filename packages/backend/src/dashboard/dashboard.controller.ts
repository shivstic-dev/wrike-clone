import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { dashboardOverviewQuerySchema } from '@wrike-clone/shared';
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
    return this.dashboard.overview(dashboardOverviewQuerySchema.parse(query || {}));
  }
}
