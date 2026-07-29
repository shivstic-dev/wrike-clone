/**
 * Health check endpoints.
 * Used by load balancers, orchestration, and monitoring.
 */

import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { Knex } from 'knex';
import { DATABASE_PROVIDER } from '../database/database.module';
import { loadAppConfig } from '../config/app.config';

@Controller('health')
export class HealthController {
  constructor(@Inject(DATABASE_PROVIDER) private readonly db: Knex) {}

  @Get()
  async check() {
    const config = loadAppConfig();
    let dbStatus = 'ok';
    let dbLatency = 0;

    try {
      const start = Date.now();
      await this.db.raw('SELECT 1');
      dbLatency = Date.now() - start;
    } catch {
      dbStatus = 'error';
    }

    return {
      status: dbStatus === 'ok' ? 'healthy' : 'degraded',
      version: config.nodeEnv,
      timestamp: new Date().toISOString(),
      checks: {
        database: { status: dbStatus, latencyMs: dbLatency },
        memory: {
          heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        },
        uptime: process.uptime(),
      },
    };
  }

  @Get('ready')
  async readiness() {
    try {
      await this.db.raw('SELECT 1');
      return { status: 'ready' };
    } catch {
      throw new ServiceUnavailableException({ status: 'not ready' });
    }
  }
}
