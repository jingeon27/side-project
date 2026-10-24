import type { ComponentType } from 'react';

import { composeStories, setProjectAnnotations } from '@storybook/react-vite';
import { render } from '@testing-library/react';
import axe from 'axe-core';
import { beforeAll, expect, it } from 'vitest';

import preview from '../../.storybook/preview';

type TStoryModule = Parameters<typeof composeStories>[0];

const modules = import.meta.glob<TStoryModule>('../**/*.stories.tsx', { eager: true });
const stories = Object.entries(modules).flatMap(([path, module]) =>
  Object.entries(composeStories(module)).map(
    ([name, Story]) => [`${path.replace('../', '')} › ${name}`, Story as ComponentType] as const,
  ),
);

beforeAll(() => {
  setProjectAnnotations(preview);
  // Storybook a11y 애드온과 같게 landmark 규칙은 끈다. jsdom은 스타일을 계산하지 않아 색 대비는 토큰 테스트가 맡는다.
  axe.configure({ rules: [{ id: 'region', enabled: false }] });
});

it('a11y 위반을 실패로 다룬다', () => {
  expect(preview.parameters?.a11y).toMatchObject({ test: 'error' });
  expect(stories.length).toBeGreaterThan(30);
});

it.each(stories)('%s 스토리에 axe 위반이 없어야 한다', async (_, Story) => {
  const { unmount } = render(<Story />);
  const { violations } = await axe.run(document.body, { rules: { 'color-contrast': { enabled: false } } });
  unmount();
  expect(
    violations.map(
      (violation) => `${violation.id}: ${violation.nodes.map((node) => node.target).join(', ')}`,
    ),
  ).toEqual([]);
});
