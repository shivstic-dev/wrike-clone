import { Module } from '@nestjs/common';
import { RbacService } from './rbac.service';
import { RbacController } from './rbac.controller';
import { DepartmentAccessService } from './department-access.service';

@Module({
  controllers: [RbacController],
  providers: [RbacService, DepartmentAccessService],
  exports: [RbacService, DepartmentAccessService],
})
export class RbacModule {}
