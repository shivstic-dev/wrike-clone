/**
 * File metadata and private Supabase Storage object management.
 */

import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';
import { requireTenantContext } from '../common/tenant-context';
import { loadSupabaseStorageConfig } from '../config/app.config';
import { DATABASE_PROVIDER } from '../database/database.module';

interface UploadInput {
  taskId: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  content: string;
  thumbnailContent?: string;
}

@Injectable()
export class FileService {
  private readonly logger = new Logger(FileService.name);
  private readonly maxFileSize = 104_857_600;

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
      .select('files.*', 'file_versions.*')
      .first();

    if (!file) throw new NotFoundException('File not found');
    return file;
  }

  async createDownloadUrl(id: string): Promise<{ url: string; expiresIn: number }> {
    const file = await this.findById(id);
    const expiresIn = 60;
    const result = await this.storageRequest(
      `/storage/v1/object/sign/${this.encodedObjectPath(file.storage_path)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expiresIn }),
      },
    );
    const payload = (await result.json()) as { signedURL?: string; signedUrl?: string };
    const signedPath = payload.signedURL || payload.signedUrl;
    if (!signedPath) throw new ServiceUnavailableException('Storage did not return a signed URL');

    const config = this.requireStorageConfig();
    return {
      url: signedPath.startsWith('http') ? signedPath : `${config.url}${signedPath}`,
      expiresIn,
    };
  }

  async upload(input: UploadInput) {
    const ctx = requireTenantContext();
    const bytes = this.decodeContent(input.content);

    if (bytes.length > this.maxFileSize || input.sizeBytes > this.maxFileSize) {
      throw new BadRequestException(
        `File exceeds maximum size of ${this.maxFileSize / 1024 / 1024}MB`,
      );
    }
    if (bytes.length !== input.sizeBytes) {
      throw new BadRequestException('Declared file size does not match uploaded content');
    }

    const task = await this.db('tasks')
      .where({ id: input.taskId, tenant_id: ctx.tenantId })
      .whereNull('deleted_at')
      .first();
    if (!task) throw new NotFoundException('Task not found');

    const fileId = uuidv4();
    const versionId = uuidv4();
    const safeName = input.originalName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 180);
    if (!safeName) throw new BadRequestException('Invalid file name');

    const storagePath = `${ctx.tenantId}/tasks/${input.taskId}/${fileId}/v1_${safeName}`;
    const checksum = createHash('sha256').update(bytes).digest('hex');

    await this.storageRequest(`/storage/v1/object/${this.encodedObjectPath(storagePath)}`, {
      method: 'POST',
      headers: {
        'Content-Type': input.mimeType || 'application/octet-stream',
        'x-upsert': 'false',
      },
      body: bytes,
    });

    try {
      await this.db.transaction(async (trx) => {
        await trx('files').insert({
          id: fileId,
          tenant_id: ctx.tenantId,
          task_id: input.taskId,
          current_version_id: null,
        });
        await trx('file_versions').insert({
          id: versionId,
          file_id: fileId,
          tenant_id: ctx.tenantId,
          original_name: input.originalName,
          mime_type: input.mimeType,
          size_bytes: bytes.length,
          storage_path: storagePath,
          thumbnail_path: null,
          category: this.getCategory(input.mimeType),
          uploaded_by_id: ctx.userId,
          version_number: 1,
          checksum,
        });
        await trx('files').where({ id: fileId }).update({ current_version_id: versionId });
      });
    } catch (error) {
      await this.deleteStoredObject(storagePath).catch(() => undefined);
      throw error;
    }

    this.logger.log(`Stored file ${fileId} for task ${input.taskId}`);
    return {
      fileId,
      versionId,
      download: await this.createDownloadUrl(fileId),
      thumbnailUrl: null,
    };
  }

  async remove(id: string): Promise<void> {
    const ctx = requireTenantContext();
    const file = await this.findById(id);

    await this.db('files').where({ id, tenant_id: ctx.tenantId }).update({ task_id: null });

    // Metadata is soft-deleted for auditability. The private object is removed
    // to avoid retaining customer data after an explicit delete.
    await this.deleteStoredObject(file.storage_path);
  }

  async findAnnotations(fileVersionId: string) {
    const ctx = requireTenantContext();
    return this.db('file_annotations')
      .where({ file_version_id: fileVersionId, tenant_id: ctx.tenantId })
      .orderBy('created_at', 'asc');
  }

  async addAnnotation(
    fileVersionId: string,
    input: {
      x: number;
      y: number;
      width: number;
      height: number;
      content: string;
      color?: string;
      pageNumber?: number;
    },
  ) {
    const ctx = requireTenantContext();
    const version = await this.db('file_versions')
      .where({ id: fileVersionId, tenant_id: ctx.tenantId })
      .first();
    if (!version) throw new NotFoundException('File version not found');

    const [annotation] = await this.db('file_annotations')
      .insert({
        id: uuidv4(),
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
    const updated = await this.db('file_annotations')
      .where({ id, tenant_id: ctx.tenantId })
      .update({ resolved_at: new Date() });
    if (updated !== 1) throw new NotFoundException('Annotation not found');
  }

  private requireStorageConfig() {
    const config = loadSupabaseStorageConfig();
    if (!config) {
      throw new ServiceUnavailableException(
        'File storage is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.',
      );
    }
    return config;
  }

  private async storageRequest(path: string, init: RequestInit): Promise<Response> {
    const config = this.requireStorageConfig();
    const response = await fetch(`${config.url}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${config.serviceRoleKey}`,
        apikey: config.serviceRoleKey,
        ...(init.headers || {}),
      },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 300);
      this.logger.warn(`Storage request failed (${response.status}): ${detail}`);
      throw new ServiceUnavailableException('File storage operation failed');
    }
    return response;
  }

  private async deleteStoredObject(storagePath: string): Promise<void> {
    const config = this.requireStorageConfig();
    await this.storageRequest(`/storage/v1/object/${config.bucket}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefixes: [storagePath] }),
    });
  }

  private encodedObjectPath(storagePath: string): string {
    const config = this.requireStorageConfig();
    return [config.bucket, ...storagePath.split('/')].map(encodeURIComponent).join('/');
  }

  private decodeContent(content: string): Buffer {
    const base64 = content.includes(',') ? content.slice(content.indexOf(',') + 1) : content;
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) {
      throw new BadRequestException('Invalid base64 file content');
    }
    return Buffer.from(base64, 'base64');
  }

  private getCategory(mimeType: string): string {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType === 'application/pdf' || mimeType.includes('document')) return 'document';
    return 'other';
  }
}
