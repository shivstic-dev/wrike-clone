import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Response, Request } from 'express';

/**
 * CacheControlInterceptor
 * Sets `Cache-Control: private, max-age=15` header for successful HTTP GET requests.
 */
@Injectable()
export class CacheControlInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();

    return next.handle().pipe(
      tap(() => {
        if (req && req.method === 'GET' && res.statusCode >= 200 && res.statusCode < 300) {
          if (!res.getHeader('Cache-Control')) {
            res.setHeader('Cache-Control', 'private, max-age=15');
          }
        }
      }),
    );
  }
}
