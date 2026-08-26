import { Module } from '@nestjs/common';
import { RbacModule } from '../rbac/rbac.module';
import { TimelineController } from './timeline.controller';
import { DependencyService } from './dependency.service';
import { TimelineService } from './timeline.service';

@Module({
  imports: [RbacModule],
  controllers: [TimelineController],
  providers: [TimelineService, DependencyService],
  exports: [TimelineService, DependencyService],
})
export class TimelineModule {}
