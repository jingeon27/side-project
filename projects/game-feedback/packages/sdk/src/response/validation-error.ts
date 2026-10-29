import type { z } from 'zod';

import { ApiError } from '../api-error';

export interface IResponseIssue {
  path: readonly PropertyKey[];
  code: string;
}
export class ApiResponseValidationError extends ApiError {
  readonly issues: readonly IResponseIssue[];
  constructor(status: number, issues: readonly z.core.$ZodIssue[] = []) {
    super(status, 'INVALID_API_RESPONSE', '서버 응답을 확인하지 못했어요. 새로고침 후 내용을 확인해 주세요.');
    this.name = 'ApiResponseValidationError';
    // Keep only schema paths and codes. Never attach payloads, identifiers, cookies or free-form messages.
    this.issues = issues.slice(0, 20).map((issue) => ({ path: issue.path, code: issue.code }));
  }
}
