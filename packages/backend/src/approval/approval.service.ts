/**
 * Approvals service — multi-stage approval chains for task review.
 */

import { Injectable, NotFoundException, Inject, Logger } from '@nestjs/common';
import { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';
import { DATABASE_PROVIDER } from '../database/database.module';
import { requireTenantContext } from '../common/tenant-context';
import type { CreateApprovalInput, SubmitApprovalVoteInput } from '@wrike-clone/shared';

@Injectable()
export class ApprovalService {
  private readonly logger = new Logger(ApprovalService.name);

  constructor(@Inject(DATABASE_PROVIDER) private readonly db: Knex) {}

  async createRequest(input: CreateApprovalInput) {
    const ctx = requireTenantContext();
    const id = uuidv4();
    const [request] = await this.db('approval_requests')
      .insert({
        id,
        tenant_id: ctx.tenantId,
        task_id: input.taskId,
        chain_id: input.chainId,
        requested_by_id: ctx.userId,
      })
      .returning('*');
    return request;
  }

  async submitVote(requestId: string, input: SubmitApprovalVoteInput) {
    const ctx = requireTenantContext();
    const [vote] = await this.db('approval_votes')
      .insert({
        id: uuidv4(),
        request_id: requestId,
        step_id: '', // would come from the approval chain logic
        approver_id: ctx.userId,
        status: input.status,
        comment: input.comment || null,
      })
      .returning('*');

    // Check if all required approvals received and auto-advance
    if (input.status === 'approved') {
      await this.advanceStep(requestId);
    } else if (input.status === 'rejected') {
      await this.db('approval_requests').where({ id: requestId }).update({ status: 'rejected' });
    } else if (input.status === 'changes_requested') {
      await this.db('approval_requests')
        .where({ id: requestId })
        .update({ status: 'changes_requested' });
    }

    return vote;
  }

  private async advanceStep(requestId: string): Promise<void> {
    const request = await this.db('approval_requests').where({ id: requestId }).first();
    if (!request) return;

    const nextStep = request.current_step + 1;
    const totalSteps = await this.db('approval_steps')
      .where({ chain_id: request.chain_id })
      .count('* as count')
      .first();

    if (nextStep >= Number(totalSteps?.count || 0)) {
      await this.db('approval_requests').where({ id: requestId }).update({
        status: 'approved',
        current_step: nextStep,
        completed_at: new Date(),
      });
    } else {
      await this.db('approval_requests').where({ id: requestId }).update({
        current_step: nextStep,
      });
    }
  }
}
