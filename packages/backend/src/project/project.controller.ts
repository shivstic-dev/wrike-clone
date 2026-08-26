import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ProjectService } from './project.service';
import { AuthGuard } from '../common/guards/auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Permissions } from '../common/decorators/permissions.decorator';
import { createProjectSchema, updateProjectSchema } from '@wrike-clone/shared';
import type { UpdateProjectRequest } from '@wrike-clone/shared';

@Controller('projects')
@UseGuards(AuthGuard, RolesGuard)
export class ProjectController {
  constructor(private readonly projectService: ProjectService) {}

  @Get()
  @Permissions('project:read')
  async findAll(
    @Query('folderId') folderId?: string,
    @Query('workspaceId') workspaceId?: string,
    @Query('page') page?: number,
    @Query('perPage') perPage?: number,
    @Query('status') status?: string,
  ) {
    return this.projectService.findAll({ folderId, workspaceId, page, perPage, status });
  }

  @Get(':id')
  @Permissions('project:read')
  async findOne(@Param('id') id: string) {
    return this.projectService.findById(id);
  }

  @Post()
  @Permissions('project:create')
  async create(@Body() body: unknown) {
    const input = createProjectSchema.parse(body);
    return this.projectService.create(input);
  }

  @Patch(':id')
  @Permissions('project:write')
  async update(@Param('id') id: string, @Body() body: unknown) {
    const input = updateProjectSchema.parse(body);
    return this.projectService.update(id, input as UpdateProjectRequest);
  }

  @Delete(':id')
  @Permissions('project:delete')
  async remove(@Param('id') id: string) {
    await this.projectService.remove(id);
    return { message: 'Project deleted' };
  }
}
