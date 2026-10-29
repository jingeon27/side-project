import { useState } from 'react';

import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { expect, it } from 'vitest';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './Select';

function Appearance() {
  const [value, setValue] = useState<string | null>('light');
  const items = [
    { value: 'light', label: '라이트 모드' },
    { value: 'dark', label: '다크 모드' },
  ];
  return (
    <Select items={items} value={value} onValueChange={(nextValue) => setValue(nextValue)}>
      <SelectTrigger aria-label="화면 모드">
        <SelectValue />
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false}>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

it('키보드 선택과 Escape 닫기 후 트리거로 포커스를 돌려야 한다', async () => {
  const user = userEvent.setup();
  render(<Appearance />);
  const trigger = screen.getByRole('combobox', { name: '화면 모드' });
  await user.click(trigger);
  // 목록이 열리기 전의 키 입력은 선택에 쓰이지 않는다.
  await screen.findByRole('listbox');
  await user.keyboard('{End}{Enter}');
  expect(trigger).toHaveTextContent(/^다크 모드$/);
  expect(trigger).toHaveFocus();
  await user.click(trigger);
  await screen.findByRole('listbox');
  await user.keyboard('{Escape}');
  // 닫힘 애니메이션이 끝난 뒤 목록을 제거한다.
  await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
  expect(trigger).toHaveFocus();
});
