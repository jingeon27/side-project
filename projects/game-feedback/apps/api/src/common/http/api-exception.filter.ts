import { Catch, HttpException, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { Request, Response } from 'express';
import { match } from 'ts-pattern';

import { reportUnexpectedError } from '../../monitoring/sentry';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const req = host.switchToHttp().getRequest<Request>();
    const tags = {
      method: req.method,
      route: typeof req.route?.path === 'string' ? req.route.path : 'unmatched',
    };
    const res = host.switchToHttp().getResponse<Response>();
    if (error instanceof HttpException) {
      if (error.getStatus() >= 500) reportUnexpectedError(error, tags);
      const data = error.getResponse();
      if (typeof data === 'object' && data && 'errorCode' in data) {
        res.status(error.getStatus()).json(data);
        return;
      }
      res.status(error.getStatus()).json({
        errorCode: error.getStatus() === 404 ? 'NOT_FOUND' : 'REQUEST_FAILED',
        message: '요청을 처리할 수 없습니다.',
      });
      return;
    }
    const code = error && typeof error === 'object' && 'code' in error ? error.code : null;
    // Prisma 오류 코드는 열린 값이라 알려진 코드만 고르고 나머지는 500으로 보고한다.
    match(code)
      .with('P2002', () => {
        res.status(409).json({ errorCode: 'CONFLICT', message: '이미 등록된 정보입니다.' });
      })
      .with('P2025', () => {
        res.status(404).json({ errorCode: 'NOT_FOUND', message: '대상을 찾을 수 없습니다.' });
      })
      .otherwise(() => {
        reportUnexpectedError(error, tags);
        console.error(
          'Game Feedback API request failed',
          error instanceof Error ? error.name : 'UnknownError',
        );
        res.status(500).json({
          errorCode: 'INTERNAL_ERROR',
          message: '서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
        });
      });
  }
}
