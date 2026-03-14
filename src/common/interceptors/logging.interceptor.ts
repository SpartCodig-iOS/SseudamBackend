import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';

@Injectable()
export class GlobalLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    if (context.getType() === 'http') {
      const request = context.switchToHttp().getRequest();
      const response = context.switchToHttp().getResponse();
      const { method, url, headers, body, query } = request;
      const userAgent = headers['user-agent'] || '';
      const startTime = Date.now();

      // 민감한 데이터 마스킹
      const sanitizedHeaders = { ...headers };
      if (sanitizedHeaders.authorization) {
        sanitizedHeaders.authorization = `Bearer ${sanitizedHeaders.authorization.slice(7, 20)}...`;
      }

      this.logger.log(`
╔════════════════════════════════════════════════════════════════
║ 📤 REQUEST
╠════════════════════════════════════════════════════════════════
║ Method: ${method}
║ URL: ${url}
║ User-Agent: ${userAgent.slice(0, 50)}${userAgent.length > 50 ? '...' : ''}
╠────────────────────────────────────────────────────────────────
║ 📋 Headers:
${Object.entries(sanitizedHeaders)
  .filter(([key]) => !['cookie', 'host', 'connection', 'accept-encoding'].includes(key.toLowerCase()))
  .map(([key, value]) => `║   • ${key}: ${value}`)
  .join('\n')}
╠────────────────────────────────────────────────────────────────
║ 📦 Body: ${body ? JSON.stringify(body, null, 2).split('\n').join('\n║   ') : 'null'}
║ 🔍 Query: ${Object.keys(query).length > 0 ? JSON.stringify(query) : 'none'}
╚════════════════════════════════════════════════════════════════`);

      return next.handle().pipe(
        tap((data) => {
          const endTime = Date.now();
          const duration = endTime - startTime;

          this.logger.log(`
╔════════════════════════════════════════════════════════════════
║ ✅ RESPONSE SUCCESS
╠════════════════════════════════════════════════════════════════
║ Status: ${response.statusCode}
║ URL: ${url}
║ Duration: ${duration}ms
║ Size: ${JSON.stringify(data).length} bytes
╠────────────────────────────────────────────────────────────────
║ 📦 Response Data:
${JSON.stringify(data, null, 2).split('\n').map(line => `║   ${line}`).join('\n')}
╚════════════════════════════════════════════════════════════════`);
        }),
        catchError((error) => {
          const endTime = Date.now();
          const duration = endTime - startTime;

          this.logger.error(`
╔════════════════════════════════════════════════════════════════
║ ❌ RESPONSE ERROR
╠════════════════════════════════════════════════════════════════
║ Status: ${response.statusCode || error.status || 500}
║ URL: ${url}
║ Duration: ${duration}ms
║ Error: ${error.message}
╠────────────────────────────────────────────────────────────────
║ 🚨 Error Details:
║   ${error.stack?.split('\n').slice(0, 5).join('\n║   ') || 'No stack trace'}
╚════════════════════════════════════════════════════════════════`);

          return throwError(() => error);
        })
      );
    }

    return next.handle();
  }
}