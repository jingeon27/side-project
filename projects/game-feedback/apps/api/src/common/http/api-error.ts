import { HttpException } from '@nestjs/common';

export class ApiError extends HttpException {
  constructor(status: number, errorCode: string, message: string) {
    super({ errorCode, message }, status);
  }
}
