/**
 * Customization controller — REST endpoints for custom workflows, item types,
 * blueprints, and request forms.
 */

import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { CustomizationService } from './customization.service';
import { AuthGuard } from '../common/guards/auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Permissions } from '../common/decorators/permissions.decorator';
import {
  CreateRequestFormDto,
  SubmitRequestFormDto,
  UpdateRequestFormPublicationDto,
} from './dto/request-form.dto';

@Controller('customization')
@UseGuards(AuthGuard, RolesGuard)
export class CustomizationController {
  constructor(private readonly customizationService: CustomizationService) {}

  // ── Custom Fields ─────────────────────────────────────────

  @Get('custom-fields')
  @Permissions('tenant:read')
  async findCustomFields() {
    return this.customizationService.findCustomFields();
  }

  @Post('custom-fields')
  @Permissions('workflow:create')
  async createCustomField(
    @Body()
    body: {
      name: string;
      key: string;
      fieldType: string;
      options?: string[];
      isRequired?: boolean;
    },
  ) {
    return this.customizationService.createCustomField(body);
  }

  @Delete('custom-fields/:id')
  @Permissions('workflow:manage')
  async deleteCustomField(@Param('id') id: string) {
    await this.customizationService.deleteCustomField(id);
    return { message: 'Custom field deleted' };
  }

  // ── Item Types ────────────────────────────────────────────

  @Get('item-types')
  @Permissions('tenant:read')
  async findItemTypes() {
    return this.customizationService.findItemTypes();
  }

  @Post('item-types')
  @Permissions('workflow:create')
  async createItemType(@Body() body: { name: string; icon?: string; color?: string }) {
    return this.customizationService.createItemType(body);
  }

  @Delete('item-types/:id')
  @Permissions('workflow:manage')
  async deleteItemType(@Param('id') id: string) {
    await this.customizationService.deleteItemType(id);
    return { message: 'Item type deleted' };
  }

  // ── Blueprints ────────────────────────────────────────────

  @Get('blueprints')
  @Permissions('project:read')
  async findBlueprints() {
    return this.customizationService.findBlueprints();
  }

  @Post('blueprints/save/:projectId')
  @Permissions('project:create')
  async saveAsBlueprint(@Param('projectId') projectId: string) {
    await this.customizationService.saveAsBlueprint(projectId);
    return { message: 'Project saved as blueprint' };
  }

  @Post('blueprints/create-from')
  @Permissions('project:create')
  async createFromBlueprint(
    @Body() body: { blueprintProjectId: string; name: string; folderId: string },
  ) {
    return this.customizationService.createFromBlueprint(
      body.blueprintProjectId,
      body.name,
      body.folderId,
    );
  }

  // ── Workspace Custom Statuses ─────────────────────────────

  @Get('workspace-statuses/:workspaceId')
  @Permissions('workspace:read')
  async getWorkspaceStatuses(@Param('workspaceId') workspaceId: string) {
    return this.customizationService.getWorkspaceStatuses(workspaceId);
  }

  @Patch('workspace-statuses/:workspaceId')
  @Permissions('workspace:write')
  async setWorkspaceStatuses(
    @Param('workspaceId') workspaceId: string,
    @Body() body: { statuses: Array<{ name: string; color: string; category: string }> },
  ) {
    return this.customizationService.setWorkspaceStatuses(workspaceId, body.statuses);
  }

  // ── Request Forms ─────────────────────────────────────────

  @Get('request-forms')
  @Permissions('project:read')
  async findRequestForms() {
    return this.customizationService.findRequestForms();
  }

  @Post('request-forms')
  @Permissions('tenant:manage')
  async createRequestForm(@Body() body: CreateRequestFormDto) {
    return this.customizationService.createRequestForm(body);
  }

  @Patch('request-forms/:formId')
  @Permissions('tenant:manage')
  async updateRequestFormPublication(
    @Param('formId') formId: string,
    @Body() body: UpdateRequestFormPublicationDto,
  ) {
    return this.customizationService.updateRequestFormPublication(formId, body.isPublic);
  }

  @Post('request-forms/:formId/submit')
  @Permissions('task:create')
  async submitRequestForm(@Param('formId') formId: string, @Body() body: SubmitRequestFormDto) {
    return this.customizationService.submitRequestForm(formId, body.values);
  }
}
