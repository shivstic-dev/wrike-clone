import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { WebhookService } from './webhook.service';
import { AuthGuard } from '../common/guards/auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Permissions } from '../common/decorators/permissions.decorator';
import { createWebhookSchema } from '@wrike-clone/shared';

@Controller('webhooks')
@UseGuards(AuthGuard, RolesGuard)
export class WebhookController {
  constructor(private readonly webhookService: WebhookService) {}

  @Get()
  @Permissions('tenant:manage')
  async findAll() {
    return this.webhookService.findAll();
  }

  @Post()
  @Permissions('tenant:manage')
  async create(@Body() body: unknown) {
    const input = createWebhookSchema.parse(body);
    return this.webhookService.create(input);
  }

  @Patch(':id/toggle')
  @Permissions('tenant:manage')
  async toggle(@Param('id') id: string, @Body() body: { isActive: boolean }) {
    return this.webhookService.toggle(id, body.isActive);
  }

  @Delete(':id')
  @Permissions('tenant:manage')
  async remove(@Param('id') id: string) {
    await this.webhookService.remove(id);
    return { message: 'Webhook deleted' };
  }
}
