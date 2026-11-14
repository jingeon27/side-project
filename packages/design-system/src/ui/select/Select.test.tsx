import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { expect, it } from 'vitest';

import { focusRingOf } from '../../test/tailwind-theme';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './Select';

const languages = [
  { value: 'ko', label: '한국어' },
  { value: 'en', label: 'English' },
];

it('방향키로 포커스를 옮긴 옵션은 전역 포커스 링을 지우지 않고 안쪽에 그려야 한다', async () => {
  const user = userEvent.setup();
  render(
    <Select items={languages} defaultValue="ko">
      <SelectTrigger aria-label="언어">
        <SelectValue />
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false}>
        {languages.map((language) => (
          <SelectItem key={language.value} value={language.value}>
            {language.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>,
  );

  await user.click(screen.getByRole('combobox', { name: '언어' }));
  // 목록은 열린 뒤 선택된 옵션으로 포커스를 옮긴다. 그 전에 누른 키는 이 포커스 이동에 덮인다.
  await waitFor(() => expect(screen.getByRole('option', { name: '한국어' })).toHaveFocus());
  await user.keyboard('{End}');
  const option = screen.getByRole('option', { name: 'English' });
  await waitFor(() => expect(option).toHaveFocus());
  // 목록에는 안쪽 여백이 없어 바깥으로 그린 링은 overflow에 잘린다. 강조 배경만으로는 약 1.1:1이다.
  const ring = await focusRingOf(option);
  expect(ring.hidden).toBe(false);
  expect(ring.outerEdge).toBeLessThanOrEqual(0);
});
