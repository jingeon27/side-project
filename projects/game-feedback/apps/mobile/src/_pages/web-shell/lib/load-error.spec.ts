import { expect, it } from 'vitest';
import { isLoadFailure } from './load-error';
it('ignores navigation cancellation and reports connection errors', () => {
  expect(isLoadFailure({ code: -999 })).toBe(false);
  expect(isLoadFailure({ code: 101, domain: 'WebKitErrorDomain' })).toBe(false);
  expect(isLoadFailure({ code: -1009, domain: 'NSURLErrorDomain' })).toBe(true);
});
