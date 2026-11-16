import { createRef } from 'react';

import { act, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Disclosure, DisclosureTrigger } from './Disclosure';

describe('Disclosure', () => {
  it('summary를 누르면 native details를 열고 닫으며 닫힌 내용은 보이지 않아야 한다', async () => {
    const user = userEvent.setup();
    render(
      <Disclosure>
        <DisclosureTrigger>
          그룹 사진 추가<span aria-hidden="true">선택</span>
        </DisclosureTrigger>
        <p>배경 사진을 고르세요</p>
      </Disclosure>,
    );
    const label = screen.getByText('그룹 사진 추가');
    const details = label.closest('details');
    // 브라우저가 Enter·Space 토글과 펼침 상태 안내를 맡으려면 summary가 details의 첫 자식이어야 한다.
    expect(details?.firstElementChild).toBe(label.closest('summary'));
    expect(screen.getByText('배경 사진을 고르세요')).not.toBeVisible();

    await user.click(label);
    expect(details).toHaveAttribute('open');
    expect(screen.getByText('배경 사진을 고르세요')).toBeVisible();

    await user.click(label);
    expect(details).not.toHaveAttribute('open');
    expect(screen.getByText('배경 사진을 고르세요')).not.toBeVisible();
  });

  it('앱이 ref로 열고 summary에 포커스를 옮길 수 있게 native props와 ref를 details에 전달해야 한다', async () => {
    const ref = createRef<HTMLDetailsElement>();
    const onToggle = vi.fn();
    render(
      <Disclosure ref={ref} id="group-community" variant="card" className="p-5" onToggle={onToggle}>
        <DisclosureTrigger className="text-title">초대와 그룹 멤버</DisclosureTrigger>
        <p>친구에게 그룹을 소개해 보세요</p>
      </Disclosure>,
    );
    const details = ref.current;
    const trigger = screen.getByText('초대와 그룹 멤버').closest('summary');
    expect(details).toBe(trigger?.parentElement);
    expect(details).toHaveAttribute('id', 'group-community');
    expect(details).toHaveClass('rounded-card', 'border-line', 'p-5');
    expect(details).not.toHaveClass('p-4');
    expect(trigger).toHaveClass('text-title', 'text-ink');
    expect(trigger).not.toHaveClass('text-label');

    // 그룹 소개의 '초대와 멤버 보기'처럼 앱이 직접 열고 summary로 포커스를 옮긴다.
    act(() => {
      if (details) details.open = true;
      details?.querySelector('summary')?.focus();
    });
    expect(trigger).toHaveFocus();
    expect(screen.getByText('친구에게 그룹을 소개해 보세요')).toBeVisible();
    await waitFor(() => expect(onToggle).toHaveBeenCalledOnce());
  });
});
