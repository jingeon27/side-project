import { ApiError } from './http/api-error';

export function encodeCursor(row: { id: string; createdAt: Date }) {
  return Buffer.from(JSON.stringify([row.createdAt.toISOString(), row.id])).toString('base64url');
}
export function decodeCursor(value?: string): { createdAt: Date; id: string } | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, 'base64url').toString());
    if (
      !Array.isArray(parsed) ||
      parsed.length !== 2 ||
      typeof parsed[0] !== 'string' ||
      typeof parsed[1] !== 'string' ||
      !parsed[1] ||
      Number.isNaN(Date.parse(parsed[0]))
    )
      throw new Error();
    return { createdAt: new Date(parsed[0]), id: parsed[1] };
  } catch {
    throw new ApiError(400, 'INVALID_CURSOR', '목록 위치가 올바르지 않습니다.');
  }
}
