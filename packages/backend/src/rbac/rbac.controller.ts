import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { RbacService } from './rbac.service';
import { AuthGuard } from '../common/guards/auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Permissions } from '../common/decorators/permissions.decorator';

@Controller('rbac')
@UseGuards(AuthGuard, RolesGuard)
export class RbacController {
  constructor(private readonly rbacService: RbacService) {}

  @Get('roles')
  @Permissions('tenant:manage')
  getRoles() {
    return { roles: this.rbacService.getAllRoles() };
  }

  @Get('permissions')
  @Permissions('tenant:manage')
  getPermissions() {
    return { permissions: this.rbacService.getAllPermissions() };
  }

  @Get('roles/:role/permissions')
  @Permissions('tenant:manage')
  getRolePermissions(@Param('role') role: string) {
    return {
      role,
      permissions: this.rbacService.getPermissionsForRole(role),
    };
  }
}
