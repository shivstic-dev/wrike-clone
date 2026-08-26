import { Controller, Get, Post, Param, Body, Query, UseGuards } from '@nestjs/common';
import { TimelogService } from './timelog.service';
import { AuthGuard } from '../common/guards/auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { createTimeEntrySchema } from '@wrike-clone/shared';

@Controller('time-entries')
@UseGuards(AuthGuard, RolesGuard)
export class TimelogController {
  constructor(private readonly timelogService: TimelogService) {}

  @Get()
  async findByTask(@Query('taskId') taskId: string) {
    return this.timelogService.findByTask(taskId);
  }

  @Post()
  async create(@Body() body: unknown) {
    const input = createTimeEntrySchema.parse(body);
    return this.timelogService.create(input);
  }

  @Post(':id/lock')
  async lock(@Param('id') id: string) {
    await this.timelogService.lock(id);
    return { message: 'Time entry locked' };
  }
}
