import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { WorkspaceService } from './workspace.service';
import { AuthGuard } from '../common/guards/auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Permissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
  createWorkspaceSchema,
  updateWorkspaceSchema,
  addWorkspaceMemberSchema,
  updateWorkspaceMemberRoleSchema,
} from '@wrike-clone/shared';

@Controller('workspaces')
@UseGuards(AuthGuard, RolesGuard)
export class WorkspaceController {
  constructor(private readonly workspaceService: WorkspaceService) {}

  @Get()
  @Permissions('workspace:read')
  async findAll(@CurrentUser() user: any) {
    return this.workspaceService.findAllForUser(user);
  }

  @Get(':id')
  @Permissions('workspace:read')
  async findOne(@Param('id') id: string) {
    return this.workspaceService.findById(id);
  }

  @Post()
  @Permissions('workspace:create')
  async create(@Body() body: unknown) {
    const input = createWorkspaceSchema.parse(body);
    return this.workspaceService.create(input);
  }

  @Patch(':id')
  @Permissions('workspace:write')
  async update(@Param('id') id: string, @Body() body: unknown) {
    const input = updateWorkspaceSchema.parse(body);
    return this.workspaceService.update(id, input);
  }

  @Delete(':id')
  @Permissions('workspace:delete')
  async remove(@Param('id') id: string) {
    await this.workspaceService.remove(id);
    return { message: 'Workspace deleted' };
  }

  // ── Workspace Members (Department members) ──────────────────────

  @Get(':id/members')
  @Permissions('workspace:read')
  async findMembers(@Param('id') id: string) {
    return this.workspaceService.findMembers(id);
  }

  @Post(':id/members')
  @Permissions('user:role:manage')
  async addMember(@Param('id') id: string, @Body() body: unknown) {
    const input = addWorkspaceMemberSchema.parse(body);
    return this.workspaceService.addMember(id, input);
  }

  @Patch(':id/members/:userId')
  @Permissions('user:role:manage')
  async updateMemberRole(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Body() body: unknown,
  ) {
    const input = updateWorkspaceMemberRoleSchema.parse(body);
    return this.workspaceService.updateMemberRole(id, userId, input.role);
  }

  @Delete(':id/members/:userId')
  @Permissions('user:role:manage')
  async removeMember(@Param('id') id: string, @Param('userId') userId: string) {
    await this.workspaceService.removeMember(id, userId);
    return { message: 'Member removed from workspace' };
  }
}
