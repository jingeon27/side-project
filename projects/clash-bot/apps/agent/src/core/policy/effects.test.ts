import { expect, it } from 'vitest';

import { observedContacts } from './effects.ts';

const enemies = [
  ['skeleton', 5, 6, 'base'],
  ['skeleton', 5, 7, 'base'],
  ['skeleton', 8, 9, 'base'],
  ['?', 5, 6, 'unknown'],
] as const;
it('distinguishes Ice Wizard deployment splash, the ground roll corridor and Poison area', () => {
  expect(observedContacts('ice_wizard', [5, 5], enemies)).toBe(3);
  expect(observedContacts('barbarian_barrel', [5, 5], enemies)).toBe(2);
  expect(observedContacts('barbarian_barrel', [5, 8], enemies)).toBe(0);
  expect(observedContacts('poison', [5, 7], enemies)).toBe(3);
  expect(observedContacts('poison', [15, 25], enemies)).toBe(0);
  expect(observedContacts('goblin_hut', [5, 5], enemies)).toBeNull();
});
