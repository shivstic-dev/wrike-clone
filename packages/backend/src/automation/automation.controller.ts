import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { AutomationService } from './automation.service';
import { AuthGuard } from '../common/guards/auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Permissions } from '../common/decorators/permissions.decorator';
import { createAutomationRuleSchema } from '@wrike-clone/shared';

@Controller('automation')
@UseGuards(AuthGuard, RolesGuard)
export class AutomationController {
  constructor(private readonly automationService: AutomationService) {}

  @Get()
  @Permissions('workflow:manage')
  async findAll() {
    return this.automationService.findAll();
  }

  @Post()
  @Permissions('workflow:create')
  async create(@Body() body: unknown) {
    const input = createAutomationRuleSchema.parse(body);
    return this.automationService.create(input);
  }

  @Patch(':id/toggle')
  @Permissions('workflow:manage')
  async toggle(@Param('id') id: string, @Body() body: { isActive: boolean }) {
    return this.automationService.toggle(id, body.isActive);
  }

  @Delete(':id')
  @Permissions('workflow:manage')
  async remove(@Param('id') id: string) {
    await this.automationService.remove(id);
    return { message: 'Rule deleted' };
  }
}
