/**
 * Root application module.
 * Imports all feature modules and configures global providers.
 * Redis/BullMQ are conditionally loaded only when REDIS_HOST is set.
 */

import { Module, NestModule, MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { DatabaseModule } from './database/database.module';
import { CacheModule } from './common/cache/cache.module';
import { TenantContextMiddleware } from './common/middleware/tenant-context.middleware';
import { TenantContextInterceptor } from './common/interceptors/tenant-context.interceptor';
import { CamelCaseResponseInterceptor } from './common/interceptors/camel-case-response.interceptor';
import { CacheControlInterceptor } from './common/interceptors/cache-control.interceptor';
import { GlobalExceptionFilter } from './common/filters/http-exception.filter';
import { EventsService } from './common/events.service';
import { AuthModule } from './auth/auth.module';
import { TenantModule } from './tenant/tenant.module';
import { UserModule } from './user/user.module';
import { WorkspaceModule } from './workspace/workspace.module';
import { FolderModule } from './folder/folder.module';
import { ProjectModule } from './project/project.module';
import { TaskModule } from './task/task.module';
import { RbacModule } from './rbac/rbac.module';
import { NotificationModule } from './notification/notification.module';
import { AutomationModule } from './automation/automation.module';
import { ApprovalModule } from './approval/approval.module';
import { FileModule } from './file/file.module';
import { TimelogModule } from './timelog/timelog.module';
import { WebhookModule } from './webhook/webhook.module';
import { SearchModule } from './search/search.module';
import { HealthModule } from './health/health.module';
import { CustomizationModule } from './customization/customization.module';
import { EmailModule } from './email/email.module';
import { ScheduleModule } from './schedule/schedule.module';
import { CopilotModule } from './copilot/copilot.module';
import { ReportModule } from './reports/report.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { TimelineModule } from './timeline/timeline.module';
import { RealtimeModule } from './realtime/realtime.module';

// Conditionally register BullMQ only when Redis is configured
const queueImports: any[] = [];
if (process.env['REDIS_HOST']) {
  const { BullModule } = require('@nestjs/bullmq');
  queueImports.push(
    BullModule.forRoot({
      connection: {
        host: process.env['REDIS_HOST'],
        port: parseInt(process.env['REDIS_PORT'] || '6379', 10),
        password: process.env['REDIS_PASSWORD'] || undefined,
        db: parseInt(process.env['REDIS_DB'] || '0', 10),
      },
    }),
  );
}

@Module({
  imports: [
    // Core
    DatabaseModule,
    CacheModule,
    RealtimeModule,

    // Rate limiting
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100,
      },
    ]),

    // Conditional Redis/BullMQ
    ...queueImports,

    // Feature modules
    HealthModule,
    AuthModule,
    TenantModule,
    UserModule,
    WorkspaceModule,
    FolderModule,
    ProjectModule,
    TaskModule,
    RbacModule,
    NotificationModule,
    AutomationModule,
    ApprovalModule,
    FileModule,
    TimelogModule,
    WebhookModule,
    SearchModule,
    CustomizationModule,
    EmailModule,
    ScheduleModule,
    CopilotModule,
    ReportModule,
    DashboardModule,
    TimelineModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: TenantContextInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: CamelCaseResponseInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: CacheControlInterceptor,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    EventsService,
  ],
  exports: [EventsService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantContextMiddleware).forRoutes({ path: '(.*)', method: RequestMethod.ALL });
  }
}
