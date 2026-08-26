import { Controller, Post, Param, Body, UseGuards } from '@nestjs/common';
import { ApprovalService } from './approval.service';
import { AuthGuard } from '../common/guards/auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Permissions } from '../common/decorators/permissions.decorator';
import { createApprovalSchema, submitApprovalVoteSchema } from '@wrike-clone/shared';

@Controller('approvals')
@UseGuards(AuthGuard, RolesGuard)
export class ApprovalController {
  constructor(private readonly approvalService: ApprovalService) {}

  @Post()
  @Permissions('approval:route')
  async createRequest(@Body() body: unknown) {
    const input = createApprovalSchema.parse(body);
    return this.approvalService.createRequest(input);
  }

  @Post(':requestId/vote')
  @Permissions('approval:approve')
  async submitVote(@Param('requestId') requestId: string, @Body() body: unknown) {
    const input = submitApprovalVoteSchema.parse(body);
    return this.approvalService.submitVote(requestId, input);
  }
}
