import { expect, it } from 'vitest';

import { parseWebOrigin } from './web-origin';

it('uses loopback only as a development default and requires explicit HTTPS in release builds', () => {
  expect(parseWebOrigin(undefined, true)).toBe('http://localhost:3300');
  expect(parseWebOrigin('https://feedback.example', false)).toBe('https://feedback.example');
  for (const value of [
    undefined,
    'http://feedback.example',
    'https://feedback.example/ko',
    'https://user:secret@feedback.example',
    'javascript:alert(1)',
  ])
    expect(() => parseWebOrigin(value, false)).toThrow();
});
