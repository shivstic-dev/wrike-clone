/**
 * Schedule service — manages user working schedules (holidays, vacation, working hours).
 * Used for workload capacity planning across the platform.
 *
 * Tables (created by migration 009):
 *   - working_hours: per-user default working hours (day_of_week, start_time, end_time)
 *   - time_off: vacation/sick day requests (user_id, date, type, status)
 *   - tenant_holidays: company-wide holidays (tenant_id, date, name)
 */

import { Injectable, NotFoundException, Inject, Logger } from '@nestjs/common';
import { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';
import { DATABASE_PROVIDER } from '../database/database.module';
import { requireTenantContext } from '../common/tenant-context';

@Injectable()
export class ScheduleService {
  private readonly logger = new Logger(ScheduleService.name);

  constructor(@Inject(DATABASE_PROVIDER) private readonly db: Knex) {}

  // ── Working Hours ─────────────────────────────────────────

  async getWorkingHours(userId: string) {
    const ctx = requireTenantContext();
    return this.db('working_hours')
      .where({ tenant_id: ctx.tenantId, user_id: userId })
      .orderBy('day_of_week', 'asc');
  }

  async setWorkingHours(
    userId: string,
    hours: Array<{ dayOfWeek: number; startTime: string; endTime: string }>,
  ) {
    const ctx = requireTenantContext();
    await this.db.transaction(async (trx: any) => {
      await trx('working_hours').where({ tenant_id: ctx.tenantId, user_id: userId }).del();

      const inserts = hours.map((h) => ({
        id: uuidv4(),
        tenant_id: ctx.tenantId,
        user_id: userId,
        day_of_week: h.dayOfWeek,
        start_time: h.startTime,
        end_time: h.endTime,
      }));
      if (inserts.length > 0) {
        await trx('working_hours').insert(inserts);
      }
    });
  }

  // ── Time Off (Vacation / Sick Days) ──────────────────────

  async getTimeOff(userId?: string) {
    const ctx = requireTenantContext();
    const query = this.db('time_off')
      .where('time_off.tenant_id', ctx.tenantId)
      .join('users', 'time_off.user_id', 'users.id')
      .select('time_off.*', 'users.display_name', 'users.email');

    if (userId) query.andWhere('time_off.user_id', userId);
    return query.orderBy('time_off.date', 'desc');
  }

  async requestTimeOff(input: {
    date: string;
    type: 'vacation' | 'sick' | 'personal';
    reason?: string;
  }) {
    const ctx = requireTenantContext();
    const id = uuidv4();
    const [entry] = await this.db('time_off')
      .insert({
        id,
        tenant_id: ctx.tenantId,
        user_id: ctx.userId,
        date: input.date,
        type: input.type,
        reason: input.reason || null,
        status: 'pending',
      })
      .returning('*');
    return entry;
  }

  async approveTimeOff(id: string, approved: boolean) {
    const ctx = requireTenantContext();
    const entry = await this.db('time_off').where({ id, tenant_id: ctx.tenantId }).first();
    if (!entry) throw new NotFoundException('Time off entry not found');

    const [updated] = await this.db('time_off')
      .where({ id })
      .update({ status: approved ? 'approved' : 'rejected' })
      .returning('*');
    return updated;
  }

  // ── Company Holidays ─────────────────────────────────────

  async getHolidays(year?: number) {
    const ctx = requireTenantContext();
    const query = this.db('tenant_holidays').where({ tenant_id: ctx.tenantId });

    if (year) {
      query.whereRaw('EXTRACT(YEAR FROM date) = ?', [year]);
    }
    return query.orderBy('date', 'asc');
  }

  async addHoliday(input: { date: string; name: string }) {
    const ctx = requireTenantContext();
    const id = uuidv4();
    const [holiday] = await this.db('tenant_holidays')
      .insert({
        id,
        tenant_id: ctx.tenantId,
        date: input.date,
        name: input.name,
      })
      .returning('*');
    return holiday;
  }

  async removeHoliday(id: string): Promise<void> {
    const ctx = requireTenantContext();
    await this.db('tenant_holidays').where({ id, tenant_id: ctx.tenantId }).del();
  }

  // ── Capacity Planning ────────────────────────────────────

  async getUserCapacity(userId: string, startDate: string, endDate: string) {
    const ctx = requireTenantContext();

    // Get working hours
    const hours = await this.getWorkingHours(userId);

    // Get time off in range
    const timeOff = await this.db('time_off')
      .where({
        tenant_id: ctx.tenantId,
        user_id: userId,
        status: 'approved',
      })
      .whereBetween('date', [startDate, endDate]);

    // Get holidays in range
    const holidays = await this.db('tenant_holidays')
      .where({ tenant_id: ctx.tenantId })
      .whereBetween('date', [startDate, endDate]);

    // Calculate capacity
    const daysOff = new Set([
      ...timeOff.map((t: any) => t.date),
      ...holidays.map((h: any) => h.date),
    ]);

    const start = new Date(startDate);
    const end = new Date(endDate);
    let totalMinutes = 0;

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      if (daysOff.has(dateStr)) continue;

      const dayOfWeek = d.getDay(); // 0=Sun, 1=Mon, ...
      const dayHours = hours.find((h: any) => h.day_of_week === dayOfWeek);
      if (dayHours) {
        const [startH, startM] = dayHours.start_time.split(':').map(Number);
        const [endH, endM] = dayHours.end_time.split(':').map(Number);
        totalMinutes += endH * 60 + endM - (startH * 60 + startM);
      } else {
        // Default: 8 hours on weekdays
        if (dayOfWeek >= 1 && dayOfWeek <= 5) {
          totalMinutes += 8 * 60;
        }
      }
    }

    return {
      userId,
      totalCapacityMinutes: totalMinutes,
      totalCapacityHours: totalMinutes / 60,
      timeOffDays: timeOff.length,
      holidayDays: holidays.length,
    };
  }
}
