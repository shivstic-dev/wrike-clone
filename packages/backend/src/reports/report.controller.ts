import { BadRequestException, Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { departmentReportFilterSchema } from '@wrike-clone/shared';
import { AuthGuard } from '../common/guards/auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Permissions } from '../common/decorators/permissions.decorator';
import { ReportService } from './report.service';

@Controller('reports/departments')
@UseGuards(AuthGuard, RolesGuard)
export class ReportController {
  constructor(private readonly reports: ReportService) {}

  @Get()
  @Permissions('task:read')
  async metrics(@Query() query: unknown) {
    const { format: _format, ...filter } = departmentReportFilterSchema.parse(query || {});
    return this.reports.build(filter);
  }

  @Get('export')
  @Permissions('task:read')
  async export(@Query() query: unknown, @Res() response: Response): Promise<void> {
    const filter = departmentReportFilterSchema.parse(query || {});
    if (!filter.format) throw new BadRequestException('Export format is required');
    const result = await this.reports.export({ ...filter, format: filter.format });
    response.setHeader('Content-Type', result.contentType);
    response.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    response.setHeader('Cache-Control', 'private, no-store');
    response.send(result.buffer);
  }
}
