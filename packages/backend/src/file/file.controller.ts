/**
 * File controller — upload, download, versioning, and proofing annotations.
 * Uses MinIO/S3 for blob storage and file_versions table for metadata.
 * v1: Local filesystem fallback when S3 is not configured.
 */

import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileService } from './file.service';
import { AuthGuard } from '../common/guards/auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Permissions } from '../common/decorators/permissions.decorator';

@Controller('files')
@UseGuards(AuthGuard, RolesGuard)
export class FileController {
  constructor(private readonly fileService: FileService) {}

  @Get('task/:taskId')
  @Permissions('task:read')
  async findByTask(@Param('taskId') taskId: string) {
    return this.fileService.findByTask(taskId);
  }

  @Post('upload')
  @Permissions('task:write')
  async upload(
    @Body()
    body: {
      taskId: string;
      originalName: string;
      mimeType: string;
      sizeBytes: number;
      content: string;
      thumbnailContent?: string;
    },
  ) {
    return this.fileService.upload(body);
  }

  @Get(':id/download')
  @Permissions('task:read')
  async createDownloadUrl(@Param('id') id: string) {
    return this.fileService.createDownloadUrl(id);
  }

  @Get(':id')
  @Permissions('task:read')
  async findOne(@Param('id') id: string) {
    return this.fileService.findById(id);
  }

  @Delete(':id')
  @Permissions('task:write')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string) {
    await this.fileService.remove(id);
  }

  // ── Annotations (Proofing) ─────────────────────────────────

  @Get(':fileVersionId/annotations')
  @Permissions('task:read')
  async findAnnotations(@Param('fileVersionId') fileVersionId: string) {
    return this.fileService.findAnnotations(fileVersionId);
  }

  @Post(':fileVersionId/annotations')
  @Permissions('task:write')
  async addAnnotation(
    @Param('fileVersionId') fileVersionId: string,
    @Body()
    body: {
      x: number;
      y: number;
      width: number;
      height: number;
      content: string;
      color?: string;
      pageNumber?: number;
    },
  ) {
    return this.fileService.addAnnotation(fileVersionId, body);
  }

  @Patch('annotations/:id/resolve')
  @Permissions('task:write')
  async resolveAnnotation(@Param('id') id: string) {
    await this.fileService.resolveAnnotation(id);
    return { message: 'Annotation resolved' };
  }
}
