/**
 * Work Schedule module — manages user working hours, holidays, and vacation days.
 * Used for capacity planning and workload balancing.
 */

import { Module } from '@nestjs/common';
import { ScheduleService } from './schedule.service';
import { ScheduleController } from './schedule.controller';

@Module({
  controllers: [ScheduleController],
  providers: [ScheduleService],
  exports: [ScheduleService],
})
export class ScheduleModule {}
