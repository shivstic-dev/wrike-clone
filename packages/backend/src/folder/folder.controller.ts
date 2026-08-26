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
import { FolderService } from './folder.service';
import { AuthGuard } from '../common/guards/auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Permissions } from '../common/decorators/permissions.decorator';
import { createFolderSchema, updateFolderSchema } from '@wrike-clone/shared';

@Controller('folders')
@UseGuards(AuthGuard, RolesGuard)
export class FolderController {
  constructor(private readonly folderService: FolderService) {}

  @Get()
  @Permissions('folder:read')
  async findByWorkspace(@Query('workspaceId') workspaceId: string) {
    return this.folderService.findByWorkspace(workspaceId);
  }

  @Get(':id')
  @Permissions('folder:read')
  async findOne(@Param('id') id: string) {
    return this.folderService.findById(id);
  }

  @Post()
  @Permissions('folder:create')
  async create(@Body() body: unknown) {
    const input = createFolderSchema.parse(body);
    return this.folderService.create(input);
  }

  @Patch(':id')
  @Permissions('folder:write')
  async update(@Param('id') id: string, @Body() body: unknown) {
    const input = updateFolderSchema.parse(body);
    return this.folderService.update(id, input);
  }

  @Delete(':id')
  @Permissions('folder:delete')
  async remove(@Param('id') id: string) {
    await this.folderService.remove(id);
    return { message: 'Folder deleted' };
  }
}
