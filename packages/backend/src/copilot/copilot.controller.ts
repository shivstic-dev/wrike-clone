/**
 * Copilot controller — AI-powered task assistance API.
 */
import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { CopilotService } from './copilot.service';
import { AuthGuard } from '../common/guards/auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Permissions } from '../common/decorators/permissions.decorator';

@Controller('copilot')
@UseGuards(AuthGuard, RolesGuard)
export class CopilotController {
  constructor(private readonly copilotService: CopilotService) {}

  @Post('suggest')
  @Permissions('task:read')
  async suggest(@Body() body: { prompt: string; context?: Record<string, unknown> }) {
    return this.copilotService.getSuggestion({
      prompt: body.prompt,
      context: body.context as any,
    });
  }
}
