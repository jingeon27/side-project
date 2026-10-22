import { createRef } from 'react';

import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';

import { NativeSelect, NativeSelectOptGroup, NativeSelectOption } from './NativeSelect';

it('native select의 ref·이벤트·ARIA를 전달하고 클래스는 래퍼에 붙여야 한다', async () => {
  const user = userEvent.setup();
  const ref = createRef<HTMLSelectElement>();
  const onChange = vi.fn();
  const { container } = render(
    <NativeSelect
      ref={ref}
      aria-label="관심 분야"
      aria-invalid
      size="sm"
      className="max-w-sm"
      onChange={onChange}
    >
      <NativeSelectOptGroup label="만들기">
        <NativeSelectOption value="design">디자인</NativeSelectOption>
        <NativeSelectOption value="development">개발</NativeSelectOption>
      </NativeSelectOptGroup>
    </NativeSelect>,
  );

  const select = screen.getByRole('combobox', { name: '관심 분야' });
  expect(ref.current).toBe(select);
  expect(select).toHaveAttribute('aria-invalid', 'true');
  expect(select).toHaveAttribute('data-size', 'sm');
  await user.selectOptions(select, 'development');
  expect(onChange).toHaveBeenCalledOnce();
  expect(select).toHaveValue('development');

  const wrapper = container.firstElementChild!;
  expect(wrapper.tagName).toBe('SPAN');
  expect(wrapper).toHaveClass('block', 'max-w-sm');
  expect(wrapper.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
});

it('비활성 상태를 native disabled로 전달해야 한다', () => {
  render(
    <NativeSelect aria-label="게임" disabled>
      <NativeSelectOption value="brawl">브롤스타즈</NativeSelectOption>
    </NativeSelect>,
  );
  expect(screen.getByRole('combobox', { name: '게임' })).toBeDisabled();
});
