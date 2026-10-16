export function isLoadFailure(error: { code: number; domain?: string }) {
  if (error.code === -999) return false;
  if (error.domain === 'WebKitErrorDomain' && [101, 102].includes(error.code)) return false;
  return true;
}
