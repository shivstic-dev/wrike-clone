/**
 * Schedule controller — REST endpoints for work schedules.
 */

import { Controller, Get, Post, Patch, Delete, Param, Query, Body, UseGuards } from '@nestjs/common';
import { ScheduleService } from './schedule.service';
import { AuthGuard } from '../common/guards/auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Permissions } from '../common/decorators/permissions.decorator';

@Controller('schedule')
@UseGuards(AuthGuard, RolesGuard)
export class ScheduleController {
  constructor(private readonly scheduleService: ScheduleService) {}

  // ── Working Hours ─────────────────────────────────────────

  @Get('hours/:userId')
  @Permissions('tenant:read')
  async getWorkingHours(@Param('userId') userId: string) {
    return this.scheduleService.getWorkingHours(userId);
  }

  @Post('hours/:userId')
  @Permissions('user:role:manage')
  async setWorkingHours(
    @Param('userId') userId: string,
    @Body() body: { hours: Array<{ dayOfWeek: number; startTime: string; endTime: string }> },
  ) {
    await this.scheduleService.setWorkingHours(userId, body.hours);
    return { message: 'Working hours updated' };
  }

  // ── Time Off ──────────────────────────────────────────────

  @Get('time-off')
  @Permissions('tenant:read')
  async getTimeOff(@Query('userId') userId?: string) {
    return this.scheduleService.getTimeOff(userId);
  }

  @Post('time-off')
  @Permissions('task:read')
  async requestTimeOff(@Body() body: { date: string; type: 'vacation' | 'sick' | 'personal'; reason?: string }) {
    return this.scheduleService.requestTimeOff(body);
  }

  @Patch('time-off/:id/:action')
  @Permissions('user:role:manage')
  async approveTimeOff(@Param('id') id: string, @Param('action') action: string) {
    return this.scheduleService.approveTimeOff(id, action === 'approve');
  }

  // ── Holidays ──────────────────────────────────────────────

  @Get('holidays')
  @Permissions('tenant:read')
  async getHolidays(@Query('year') year?: number) {
    return this.scheduleService.getHolidays(year);
  }

  @Post('holidays')
  @Permissions('tenant:manage')
  async addHoliday(@Body() body: { date: string; name: string }) {
    return this.scheduleService.addHoliday(body);
  }

  @Delete('holidays/:id')
  @Permissions('tenant:manage')
  async removeHoliday(@Param('id') id: string) {
    await this.scheduleService.removeHoliday(id);
    return { message: 'Holiday removed' };
  }

  // ── Capacity ──────────────────────────────────────────────

  @Get('capacity/:userId')
  @Permissions('tenant:read')
  async getUserCapacity(
    @Param('userId') userId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.scheduleService.getUserCapacity(userId, startDate, endDate);
  }
}
