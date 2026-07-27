/**
 * Email service — sends transactional emails for task assignments,
 * comments, approval requests, and other notifications.
 *
 * Uses Nodemailer for SMTP delivery.
 * Falls back to logging when SMTP is not configured (development mode).
 */

import { Injectable, Logger } from '@nestjs/common';

export interface EmailOptions {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  from?: string;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function safeHttpUrl(value: string): string {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? escapeHtml(url.toString()) : '#';
  } catch {
    return '#';
  }
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly enabled: boolean;
  private readonly fromAddress: string;
  private transporter: any = null;

  constructor() {
    this.fromAddress = process.env['EMAIL_FROM'] || 'noreply@wrikeclone.app';
    this.enabled = !!(process.env['SMTP_HOST'] && process.env['SMTP_PORT']);

    if (this.enabled) {
      this.initTransporter();
    } else {
      this.logger.warn('SMTP not configured (SMTP_HOST/SMTP_PORT). Emails will be logged only.');
    }
  }

  private initTransporter(): void {
    try {
      // Dynamic require — nodemailer is an optional dependency
      const nodemailer = require('nodemailer');
      this.transporter = nodemailer.createTransport({
        host: process.env['SMTP_HOST'],
        port: parseInt(process.env['SMTP_PORT'] || '587', 10),
        secure: process.env['SMTP_SECURE'] === 'true',
        auth: {
          user: process.env['SMTP_USER'] || '',
          pass: process.env['SMTP_PASS'] || '',
        },
      });
      this.logger.log(`SMTP configured: ${process.env['SMTP_HOST']}:${process.env['SMTP_PORT']}`);
    } catch (err) {
      this.logger.warn(`Failed to initialize SMTP: ${(err as Error).message}`);
      this.transporter = null;
    }
  }

  /**
   * Send an email.
   * Returns false if email is not configured or fails.
   */
  async send(options: EmailOptions): Promise<boolean> {
    if (!this.enabled || !this.transporter) {
      this.logger.log(`[EMAIL LOG] To: ${options.to} | Subject: ${options.subject}`);
      return false;
    }

    try {
      await this.transporter.sendMail({
        from: options.from || this.fromAddress,
        to: options.to,
        subject: options.subject,
        text: options.text || '',
        html: options.html || options.text || '',
      });
      this.logger.log(`Email sent to ${options.to}: ${options.subject}`);
      return true;
    } catch (err) {
      this.logger.error(`Failed to send email to ${options.to}: ${(err as Error).message}`);
      return false;
    }
  }

  /**
   * Send a task assignment notification.
   */
  async sendTaskAssigned(
    toEmail: string,
    taskTitle: string,
    taskUrl: string,
    assignedBy: string,
  ): Promise<boolean> {
    const safeTaskTitle = escapeHtml(taskTitle);
    return this.send({
      to: toEmail,
      subject: `[OpenWork Hub] You've been assigned: ${taskTitle}`,
      html: `
        <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color: #4f46e5;">Task Assigned</h2>
          <p>You have been assigned a task by <strong>${escapeHtml(assignedBy)}</strong>:</p>
          <p style="font-size: 16px; font-weight: 500; color: #1e293b;">${safeTaskTitle}</p>
          <a href="${safeHttpUrl(taskUrl)}" style="display: inline-block; padding: 10px 20px; background: #4f46e5; color: white; text-decoration: none; border-radius: 8px; font-size: 14px;">
            View Task
          </a>
        </div>
      `,
    });
  }

  /**
   * Send a new comment notification.
   */
  async sendNewComment(
    toEmail: string,
    taskTitle: string,
    taskUrl: string,
    commentAuthor: string,
    commentContent: string,
  ): Promise<boolean> {
    const safeTaskTitle = escapeHtml(taskTitle);
    return this.send({
      to: toEmail,
      subject: `[OpenWork Hub] New comment on: ${taskTitle}`,
      html: `
        <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color: #4f46e5;">New Comment</h2>
          <p><strong>${escapeHtml(commentAuthor)}</strong> commented on <strong>${safeTaskTitle}</strong>:</p>
          <blockquote style="border-left: 3px solid #e2e8f0; padding: 8px 16px; margin: 12px 0; color: #475569;">
            ${escapeHtml(commentContent)}
          </blockquote>
          <a href="${safeHttpUrl(taskUrl)}" style="display: inline-block; padding: 10px 20px; background: #4f46e5; color: white; text-decoration: none; border-radius: 8px; font-size: 14px;">
            View Task
          </a>
        </div>
      `,
    });
  }

  /**
   * Send an approval request notification.
   */
  async sendApprovalRequest(
    toEmail: string,
    taskTitle: string,
    approvalUrl: string,
    requestedBy: string,
  ): Promise<boolean> {
    const safeTaskTitle = escapeHtml(taskTitle);
    return this.send({
      to: toEmail,
      subject: `[OpenWork Hub] Approval needed: ${taskTitle}`,
      html: `
        <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color: #4f46e5;">Approval Request</h2>
          <p><strong>${escapeHtml(requestedBy)}</strong> is requesting your approval on:</p>
          <p style="font-size: 16px; font-weight: 500; color: #1e293b;">${safeTaskTitle}</p>
          <a href="${safeHttpUrl(approvalUrl)}" style="display: inline-block; padding: 10px 20px; background: #4f46e5; color: white; text-decoration: none; border-radius: 8px; font-size: 14px;">
            Review & Approve
          </a>
        </div>
      `,
    });
  }

  /**
   * Send a weekly digest or report notification.
   */
  async sendDigest(toEmail: string, subject: string, summaryHtml: string): Promise<boolean> {
    return this.send({
      to: toEmail,
      subject: `[OpenWork Hub] ${subject}`,
      html: `
        <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color: #4f46e5;">${escapeHtml(subject)}</h2>
          ${summaryHtml}
        </div>
      `,
    });
  }

  async sendTaskAlert(
    toEmail: string,
    taskTitle: string,
    taskUrl: string,
    heading: string,
    detail: string,
  ): Promise<boolean> {
    return this.send({
      to: toEmail,
      subject: `[OpenWork Hub] ${heading}: ${taskTitle}`,
      html: `
        <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color: #4f46e5;">${escapeHtml(heading)}</h2>
          <p style="font-size: 16px; font-weight: 500; color: #1e293b;">${escapeHtml(taskTitle)}</p>
          <p>${escapeHtml(detail)}</p>
          <a href="${safeHttpUrl(taskUrl)}" style="display: inline-block; padding: 10px 20px; background: #4f46e5; color: white; text-decoration: none; border-radius: 8px; font-size: 14px;">
            View Task
          </a>
        </div>
      `,
    });
  }
}
