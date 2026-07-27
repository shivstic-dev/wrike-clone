import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';
import { ROOT_DATABASE_PROVIDER } from '../database/database.module';
import { EmailService } from '../email/email.service';

type AlertTask = {
  id: string;
  tenant_id: string;
  title: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: string;
  due_date: Date | string | null;
  assignee_id: string;
  email: string;
};

@Injectable()
export class NotificationSchedulerService {
  private readonly logger = new Logger(NotificationSchedulerService.name);

  constructor(
    @Inject(ROOT_DATABASE_PROVIDER) private readonly rootDb: Knex,
    private readonly email: EmailService,
  ) {}

  @Cron(process.env['NOTIFICATION_CRON'] || '0 */15 * * * *', {
    name: 'task-alerts',
    waitForCompletion: true,
  })
  async processTaskAlerts(): Promise<void> {
    const tasks = (await this.rootDb('tasks')
      .join('users', 'users.id', 'tasks.assignee_id')
      .join('tenant_memberships', function joinMembership() {
        this.on('tenant_memberships.user_id', '=', 'tasks.assignee_id').andOn(
          'tenant_memberships.tenant_id',
          '=',
          'tasks.tenant_id',
        );
      })
      .whereNull('tasks.deleted_at')
      .whereNull('users.deleted_at')
      .where('users.is_active', true)
      .where('tenant_memberships.is_active', true)
      .whereNot('tasks.status', 'completed')
      .whereNotNull('tasks.assignee_id')
      .select(
        'tasks.id',
        'tasks.tenant_id',
        'tasks.title',
        'tasks.priority',
        'tasks.status',
        'tasks.due_date',
        'tasks.assignee_id',
        'users.email',
      )) as AlertTask[];

    for (const task of tasks) {
      try {
        if (task.priority === 'high' || task.priority === 'critical') {
          await this.deliverOnce(
            task,
            'priority_alert',
            `priority:${task.id}:${task.assignee_id}:${task.priority}`,
            `${task.priority === 'critical' ? 'Critical' : 'High-priority'} task`,
            `This ${task.priority} priority task needs your attention.`,
          );
        }

        const deadline = this.deadlineRule(task.due_date);
        if (deadline) {
          await this.deliverOnce(
            task,
            deadline.rule,
            `deadline:${task.id}:${task.assignee_id}:${deadline.threshold}`,
            deadline.heading,
            deadline.detail,
          );
        }
      } catch (error) {
        this.logger.error(
          `Task alert failed for ${task.id}: ${(error as Error).message}`,
          (error as Error).stack,
        );
      }
    }
  }

  private deadlineRule(
    dueDate: Date | string | null,
  ): { rule: string; threshold: number; heading: string; detail: string } | undefined {
    if (!dueDate) return undefined;
    const hoursRemaining = (new Date(dueDate).getTime() - Date.now()) / 3_600_000;
    const thresholds = (process.env['DEADLINE_ALERT_HOURS'] || '48,24,0')
      .split(',')
      .map(Number)
      .filter((value) => Number.isFinite(value) && value >= 0)
      .sort((a, b) => a - b);

    let threshold: number | undefined;
    if (hoursRemaining <= 0 && thresholds.includes(0)) {
      threshold = 0;
    } else {
      threshold = thresholds.find((value) => value > 0 && hoursRemaining <= value);
    }
    if (threshold === undefined) return undefined;

    return threshold === 0
      ? {
          rule: 'deadline_overdue',
          threshold,
          heading: 'Task overdue',
          detail: 'The deadline for this task has passed.',
        }
      : {
          rule: `deadline_${threshold}h`,
          threshold,
          heading: 'Deadline approaching',
          detail: `This task is due within ${threshold} hours.`,
        };
  }

  private async deliverOnce(
    task: AlertTask,
    ruleType: string,
    dedupeKey: string,
    heading: string,
    detail: string,
  ): Promise<void> {
    const [claimed] = await this.rootDb('notification_log')
      .insert({
        id: uuidv4(),
        tenant_id: task.tenant_id,
        task_id: task.id,
        user_id: task.assignee_id,
        rule_type: ruleType,
        dedupe_key: dedupeKey,
      })
      .onConflict(['tenant_id', 'dedupe_key'])
      .ignore()
      .returning('id');
    if (!claimed) return;

    const appUrl = (process.env['APP_PUBLIC_URL'] || 'http://localhost:5173').replace(/\/+$/, '');
    const sent = await this.email.sendTaskAlert(
      task.email,
      task.title,
      `${appUrl}/tasks/${task.id}`,
      heading,
      detail,
    );
    if (!sent) {
      await this.rootDb('notification_log').where({ id: claimed.id }).delete();
      throw new Error('SMTP delivery failed; notification claim released for retry');
    }

    await this.rootDb('notifications').insert({
      id: uuidv4(),
      tenant_id: task.tenant_id,
      user_id: task.assignee_id,
      type: ruleType,
      title: heading,
      body: `${task.title}: ${detail}`,
      data: JSON.stringify({ entityType: 'task', entityId: task.id }),
      priority: task.priority === 'critical' ? 2 : 1,
    });
  }
}
