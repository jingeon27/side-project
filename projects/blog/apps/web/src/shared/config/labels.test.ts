import { expect, it } from 'vitest';

import ko from '../../../messages/ko.json';
import en from '../../../messages/en.json';

function keys(value: object, prefix = ''): string[] {
  return Object.entries(value)
    .flatMap(([key, child]) =>
      typeof child === 'object' && child !== null ? keys(child, `${prefix}${key}.`) : [`${prefix}${key}`],
    )
    .sort();
}

it('keeps Korean and English UI message keys aligned', () => {
  expect(keys(ko)).toEqual(keys(en));
});
