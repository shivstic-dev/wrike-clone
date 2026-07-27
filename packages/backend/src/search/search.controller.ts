/**
 * Search controller — unified search across all entity types.
 */

import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { SearchService } from './search.service';
import { AuthGuard } from '../common/guards/auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Permissions } from '../common/decorators/permissions.decorator';

@Controller('search')
@UseGuards(AuthGuard, RolesGuard)
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  @Permissions('task:read')
  async search(
    @Query('q') query: string,
    @Query('type') type?: string,
    @Query('projectId') projectId?: string,
    @Query('workspaceId') workspaceId?: string,
    @Query('assigneeId') assigneeId?: string,
    @Query('page') page?: number,
    @Query('perPage') perPage?: number,
  ) {
    return this.searchService.search({
      query: query || '',
      type: (type as any) || 'all',
      projectId,
      workspaceId,
      assigneeId,
      page: page || 1,
      perPage: perPage || 25,
    });
  }
}
