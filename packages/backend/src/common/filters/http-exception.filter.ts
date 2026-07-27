/**
 * Global HTTP exception filter.
 * Catches all exceptions and returns a consistent JSON envelope:
 *   { success: false, error: { code, message, details?, requestId? } }
 */

import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response, Request } from 'express';
import * as Sentry from '@sentry/node';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status: number;
    let message: string;
    let code: string;
    let details: Record<string, string[]> | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exResponse = exception.getResponse();

      if (typeof exResponse === 'string') {
        message = exResponse;
        code = this.statusToCode(status);
      } else if (typeof exResponse === 'object') {
        const resp = exResponse as Record<string, any>;
        message = (resp.message as string) || exception.message;
        code = (resp.code as string) || this.statusToCode(status);
        details = resp.details as Record<string, string[]> | undefined;
        // NestJS class-validator returns message as string[]
        if (Array.isArray(resp.message)) {
          message = 'Validation failed';
          details = { fields: resp.message as string[] };
        }
      } else {
        message = exception.message;
        code = this.statusToCode(status);
      }

      // Capture 500+ errors in Sentry
      if (status >= 500) {
        this.captureSentry(exception, request);
      }
    } else if (exception instanceof Error) {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      message = 'Internal server error';
      code = 'INTERNAL_ERROR';
      this.logger.error(
        `Unhandled exception on ${request.method} ${request.url}: ${exception.message}`,
        exception.stack,
      );
      // Capture 500+ errors in Sentry
      this.captureSentry(exception, request);
    } else {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      message = 'Unknown error';
      code = 'UNKNOWN_ERROR';
    }

    response.status(status).json({
      success: false,
      error: {
        code,
        message,
        ...(details ? { details } : {}),
        ...((request as unknown as Record<string, unknown>).id ? { requestId: (request as unknown as Record<string, unknown>).id as string } : {}),
      },
    });
  }

  private captureSentry(exception: unknown, request: Request): void {
    try {
      Sentry.withScope((scope) => {
        scope.setTag('status', '500');
        scope.setExtra('url', request.url);
        scope.setExtra('method', request.method);
        scope.setExtra('headers', {
          'content-type': request.headers['content-type'],
          'user-agent': request.headers['user-agent'],
        });

        if (exception instanceof Error) {
          Sentry.captureException(exception);
        } else {
          Sentry.captureMessage(`Non-Error exception: ${String(exception)}`, 'error');
        }
      });
    } catch (err) {
      this.logger.warn(`Failed to send error to Sentry: ${(err as Error).message}`);
    }
  }

  private statusToCode(status: number): string {
    const map: Record<number, string> = {
      400: 'BAD_REQUEST',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      409: 'CONFLICT',
      422: 'UNPROCESSABLE_ENTITY',
      429: 'TOO_MANY_REQUESTS',
      500: 'INTERNAL_ERROR',
    };
    return map[status] || 'ERROR';
  }
}
