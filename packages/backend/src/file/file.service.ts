/**
 * File service — manages upload, versioning, and proofing annotations.
 * v1: Base64 content stored in DB (Phase 2 will move to MinIO/S3 for production).
 */

import { Injectable, NotFoundException, Inject, Logger } from '@nestjs/common';
import { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';
import { DATABASE_PROVIDER } from '../database/database.module';
import { requireTenantContext } from '../common/tenant-context';

interface UploadInput {
  taskId: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  content: string; // base64-encoded content
  thumbnailContent?: string;
}

@Injectable()
export class FileService {
  private readonly logger = new Logger(FileService.name);
  // Maximum file size: 100MB (shared constant)
  private readonly MAX_FILE_SIZE = 104_857_600;

  constructor(@Inject(DATABASE_PROVIDER) private readonly db: Knex) {}

  async findByTask(taskId: string) {
    const ctx = requireTenantContext();
    return this.db('files')
      .join('file_versions', 'files.current_version_id', 'file_versions.id')
      .where('files.task_id', taskId)
      .andWhere('files.tenant_id', ctx.tenantId)
      .select(
        'files.id',
        'files.task_id',
        'file_versions.id as version_id',
        'file_versions.original_name',
        'file_versions.mime_type',
        'file_versions.size_bytes',
        'file_versions.version_number',
        'file_versions.created_at',
        'file_versions.uploaded_by_id',
      )
      .orderBy('file_versions.created_at', 'desc');
  }

  async findById(id: string) {
    const ctx = requireTenantContext();
    const file = await this.db('files')
      .join('file_versions', 'files.current_version_id', 'file_versions.id')
      .where('files.id', id)
      .andWhere('files.tenant_id', ctx.tenantId)
      .select(
        'files.*',
        'file_versions.*',
      )
      .first();

    if (!file) throw new NotFoundException('File not found');
    return file;
  }

  async upload(input: UploadInput) {
    const ctx = requireTenantContext();

    if (input.sizeBytes > this.MAX_FILE_SIZE) {
      throw new Error(`File exceeds maximum size of ${this.MAX_FILE_SIZE / 1024 / 1024}MB`);
    }

    const fileId = uuidv4();
    const versionId = uuidv4();
    const checksum = createHash('sha256').update(input.content).digest('hex');
    const storagePath = `tasks/${input.taskId}/${fileId}/v1_${input.originalName}`;

    // Insert file record
    const [file] = await this.db('files')
      .insert({
        id: fileId,
        tenant_id: ctx.tenantId,
        task_id: input.taskId,
        current_version_id: versionId,
      })
      .returning('*');

    // Insert first version
    const [version] = await this.db('file_versions')
      .insert({
        id: versionId,
        file_id: fileId,
        tenant_id: ctx.tenantId,
        original_name: input.originalName,
        mime_type: input.mimeType,
        size_bytes: input.sizeBytes,
        storage_path: storagePath,
        thumbnail_path: null,
        category: this.getCategory(input.mimeType),
        uploaded_by_id: ctx.userId,
        version_number: 1,
        checksum,
      })
      .returning('*');

    this.logger.log(`File ${input.originalName} uploaded to task ${input.taskId}`);

    return {
      fileId,
      versionId,
      url: storagePath,
      thumbnailUrl: null,
    };
  }

  async remove(id: string): Promise<void> {
    const ctx = requireTenantContext();
    const file = await this.db('files')
      .where({ id, tenant_id: ctx.tenantId })
      .first();
    if (!file) throw new NotFoundException('File not found');

    // Soft-delete: mark task_id as null and remove link
    await this.db('files').where({ id }).update({ task_id: null });
  }

  // ── Annotations (Proofing) ─────────────────────────────────

  async findAnnotations(fileVersionId: string) {
    const ctx = requireTenantContext();
    return this.db('file_annotations')
      .where({ file_version_id: fileVersionId, tenant_id: ctx.tenantId })
      .orderBy('created_at', 'asc');
  }

  async addAnnotation(
    fileVersionId: string,
    input: { x: number; y: number; width: number; height: number; content: string; color?: string; pageNumber?: number },
  ) {
    const ctx = requireTenantContext();
    const id = uuidv4();

    const [annotation] = await this.db('file_annotations')
      .insert({
        id,
        tenant_id: ctx.tenantId,
        file_version_id: fileVersionId,
        author_id: ctx.userId,
        page_number: input.pageNumber || null,
        x: input.x,
        y: input.y,
        width: input.width,
        height: input.height,
        content: input.content,
        color: input.color || '#ff0000',
      })
      .returning('*');

    return annotation;
  }

  async resolveAnnotation(id: string): Promise<void> {
    const ctx = requireTenantContext();
    const annotation = await this.db('file_annotations')
      .where({ id, tenant_id: ctx.tenantId })
      .first();
    if (!annotation) throw new NotFoundException('Annotation not found');

    await this.db('file_annotations')
      .where({ id })
      .update({ resolved_at: new Date() });
  }

  // ── Helpers ────────────────────────────────────────────────

  private getCategory(mimeType: string): string {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('application/pdf') || mimeType.includes('document')) return 'document';
    return 'other';
  }
}
