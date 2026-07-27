/**
 * Email module — sends transactional emails via SMTP/Nodemailer.
 *
 * v1: Synchronous email sending (falls back to logging if no SMTP configured).
 * v2: Use BullMQ queue for async email dispatch when Redis is available.
 */

import { Module } from '@nestjs/common';
import { EmailService } from './email.service';

@Module({
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
