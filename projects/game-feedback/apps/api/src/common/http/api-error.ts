import { HttpException, type HttpExceptionOptions } from '@nestjs/common';

export class ApiError extends HttpException {
  constructor(status: number, errorCode: string, message: string, options?: HttpExceptionOptions) {
    super({ errorCode, message }, status, options);
  }
}
