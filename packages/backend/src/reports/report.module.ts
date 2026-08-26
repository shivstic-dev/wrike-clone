import { Module } from '@nestjs/common';
import { RbacModule } from '../rbac/rbac.module';
import { ReportController } from './report.controller';
import { ReportService } from './report.service';

@Module({
  imports: [RbacModule],
  controllers: [ReportController],
  providers: [ReportService],
})
export class ReportModule {}
