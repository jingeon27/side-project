import { Catch, HttpException, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    if (error instanceof HttpException) {
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
    if (code === 'P2002') {
      res.status(409).json({ errorCode: 'CONFLICT', message: '이미 등록된 정보입니다.' });
      return;
    }
    if (code === 'P2025') {
      res.status(404).json({ errorCode: 'NOT_FOUND', message: '대상을 찾을 수 없습니다.' });
      return;
    }
    console.error('Game Feedback API request failed', error instanceof Error ? error.name : 'UnknownError');
    res
      .status(500)
      .json({ errorCode: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.' });
  }
}
