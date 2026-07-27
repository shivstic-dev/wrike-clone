/**
 * Automation service — no-code "when/then" rule engine.
 * v1: Rules are evaluated synchronously via processEventSync().
 * Phase 6: Rules can be dispatched via BullMQ workers when Redis is available.
 * This service handles CRUD for rules and synchronous event processing.
 */

import { Injectable, NotFoundException, Inject, Logger } from '@nestjs/common';
import { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';
import { DATABASE_PROVIDER } from '../database/database.module';
import { requireTenantContext } from '../common/tenant-context';
import type { CreateAutomationRuleInput } from '@wrike-clone/shared';
import type { TriggerEvent } from '../common/events.service';

@Injectable()
export class AutomationService {
  private readonly logger = new Logger(AutomationService.name);

  constructor(@Inject(DATABASE_PROVIDER) private readonly db: Knex) {}

  async findAll() {
    const ctx = requireTenantContext();
    return this.db('automation_rules')
      .where({ tenant_id: ctx.tenantId })
      .orderBy('sort_order', 'asc');
  }

  async create(input: CreateAutomationRuleInput) {
    const ctx = requireTenantContext();
    const id = uuidv4();
    const [rule] = await this.db('automation_rules')
      .insert({
        id,
        tenant_id: ctx.tenantId,
        name: input.name,
        trigger_event: input.triggerEvent,
        conditions: JSON.stringify(input.conditions),
        actions: JSON.stringify(input.actions),
      })
      .returning('*');
    this.logger.log(`Automation rule "${input.name}" created`);
    return rule;
  }

  async toggle(id: string, isActive: boolean) {
    const ctx = requireTenantContext();
    const rule = await this.db('automation_rules').where({ id, tenant_id: ctx.tenantId }).first();
    if (!rule) throw new NotFoundException('Rule not found');

    await this.db('automation_rules').where({ id }).update({ is_active: isActive });
    return { id, isActive };
  }

  async remove(id: string): Promise<void> {
    const ctx = requireTenantContext();
    await this.db('automation_rules').where({ id, tenant_id: ctx.tenantId }).del();
  }

  /**
   * Evaluate active automation rules for a trigger event synchronously (v1).
   * In Phase 6 this will be replaced by BullMQ worker dispatch.
   */
  async processEventSync(event: string, _payload: TriggerEvent): Promise<void> {
    try {
      const ctx = requireTenantContext();
      const rules = await this.db('automation_rules')
        .where({ tenant_id: ctx.tenantId, trigger_event: event, is_active: true })
        .orderBy('sort_order', 'asc');

      for (const rule of rules) {
        try {
          const conditions =
            typeof rule.conditions === 'string' ? JSON.parse(rule.conditions) : rule.conditions;
          const actions =
            typeof rule.actions === 'string' ? JSON.parse(rule.actions) : rule.actions;

          // Evaluate conditions (simple match — all conditions must pass)
          const conditionsMet = this.evaluateConditions(conditions, _payload);
          if (!conditionsMet) continue;

          // Execute actions
          for (const action of actions) {
            await this.executeAction(action, _payload);
          }
        } catch (ruleErr) {
          this.logger.warn(`Rule ${rule.id} execution error: ${(ruleErr as Error).message}`);
        }
      }
    } catch (err) {
      this.logger.warn(`processEventSync error for ${event}: ${(err as Error).message}`);
    }
  }

  private evaluateConditions(conditions: any[], _payload: TriggerEvent): boolean {
    if (!conditions || conditions.length === 0) return true;
    // Simple conditions evaluator — can be extended
    return conditions.every((condition: any) => {
      if (condition.operator === 'is_set') {
        return _payload.changes?.[condition.field]?.new !== undefined;
      }
      return true;
    });
  }

  private async executeAction(_action: any, _payload: TriggerEvent): Promise<void> {
    // v1: log actions; actual execution deferred
    this.logger.debug(`Action ${_action.type} triggered for ${_payload.event}`);
  }
}
