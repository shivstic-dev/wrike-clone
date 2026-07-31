import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of } from 'rxjs';
import { CacheControlInterceptor } from './cache-control.interceptor';

describe('CacheControlInterceptor', () => {
  let interceptor: CacheControlInterceptor;
  let mockRequest: any;
  let mockResponse: any;
  let mockExecutionContext: ExecutionContext;
  let mockCallHandler: CallHandler;

  beforeEach(() => {
    interceptor = new CacheControlInterceptor();
    mockRequest = { method: 'GET' };
    mockResponse = {
      statusCode: 200,
      headers: {} as Record<string, string>,
      getHeader(name: string) {
        return this.headers[name.toLowerCase()];
      },
      setHeader(name: string, value: string) {
        this.headers[name.toLowerCase()] = value;
      },
    };

    mockExecutionContext = {
      switchToHttp: () => ({
        getRequest: () => mockRequest,
        getResponse: () => mockResponse,
      }),
    } as any;

    mockCallHandler = {
      handle: () => of({ data: 'test' }),
    };
  });

  it('sets Cache-Control: private, max-age=15 header for successful GET request (200 status)', (done) => {
    mockRequest.method = 'GET';
    mockResponse.statusCode = 200;

    interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe({
      next: () => {
        expect(mockResponse.getHeader('Cache-Control')).toBe('private, max-age=15');
        done();
      },
    });
  });

  it('sets Cache-Control header for 204 status GET request', (done) => {
    mockRequest.method = 'GET';
    mockResponse.statusCode = 204;

    interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe({
      next: () => {
        expect(mockResponse.getHeader('Cache-Control')).toBe('private, max-age=15');
        done();
      },
    });
  });

  it('does NOT set Cache-Control header for POST requests', (done) => {
    mockRequest.method = 'POST';
    mockResponse.statusCode = 200;

    interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe({
      next: () => {
        expect(mockResponse.getHeader('Cache-Control')).toBeUndefined();
        done();
      },
    });
  });

  it('does NOT set Cache-Control header for non-2xx status codes (e.g. 404)', (done) => {
    mockRequest.method = 'GET';
    mockResponse.statusCode = 404;

    interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe({
      next: () => {
        expect(mockResponse.getHeader('Cache-Control')).toBeUndefined();
        done();
      },
    });
  });

  it('does NOT overwrite existing Cache-Control header', (done) => {
    mockRequest.method = 'GET';
    mockResponse.statusCode = 200;
    mockResponse.setHeader('Cache-Control', 'no-cache');

    interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe({
      next: () => {
        expect(mockResponse.getHeader('Cache-Control')).toBe('no-cache');
        done();
      },
    });
  });
});
