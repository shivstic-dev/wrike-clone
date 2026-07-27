/**
 * Events Service — abstraction for dispatching trigger events.
 *
 * v1: Synchronous dispatch (no Redis/BullMQ needed).
 *     Automation rules fire immediately and notification fan-out happens inline.
 * Phase 6 upgrade: swap the internals to BullMQ without touching any caller.
 *
 * Business code calls `eventsService.emit('task:created', payload)` and
 * never knows whether dispatch is sync or queued.
 */

import { Injectable, Logger } from '@nestjs/common';
import { AutomationService } from '../automation/automation.service';
import { NotificationService } from '../notification/notification.service';
import { WebhookService } from '../webhook/webhook.service';

export interface TriggerEvent {
  event: string;
  entityType: string;
  entityId: string;
  actorId: string;
  tenantId: string;
  changes?: Record<string, { old: unknown; new: unknown }>;
}

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(
    private readonly automationService: AutomationService,
    private readonly notificationService: NotificationService,
    private readonly webhookService: WebhookService,
  ) {}

  /**
   * Emit a trigger event. In v1 this runs synchronously:
   * 1. Evaluates automation rules and executes matching actions.
   * 2. Fans out in-app notifications.
   * 3. Fires webhook events to external integrations.
   *
   * In Phase 6 this will push to BullMQ queues instead.
   */
  async emit(event: string, payload: TriggerEvent): Promise<void> {
    try {
      // v1: Evaluate automation rules synchronously
      await this.automationService.processEventSync(event, payload);
    } catch (err) {
      this.logger.warn(`Automation rule evaluation failed for event ${event}: ${(err as Error).message}`);
    }

    try {
      // v1: Fan-out notifications synchronously
      await this.notificationService.fanOutSync(event, payload);
    } catch (err) {
      this.logger.warn(`Notification fan-out failed for event ${event}: ${(err as Error).message}`);
    }

    try {
      // Deliver webhook events to external integrations
      await this.webhookService.fireEvent(event, payload);
    } catch (err) {
      this.logger.warn(`Webhook delivery failed for event ${event}: ${(err as Error).message}`);
    }
  }
}
