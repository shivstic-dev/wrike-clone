import { Module } from '@nestjs/common';
import { TimelogService } from './timelog.service';
import { TimelogController } from './timelog.controller';

@Module({
  controllers: [TimelogController],
  providers: [TimelogService],
  exports: [TimelogService],
})
export class TimelogModule {}
