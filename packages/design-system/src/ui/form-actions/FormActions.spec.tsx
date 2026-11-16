import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Button } from '../button/Button';
import { FormActions } from './FormActions';

describe('페이지 폼의 공통 하단 행동', () => {
  it('외부 폼에 연결한 저장 버튼이 해당 폼을 한 번 제출해야 한다', async () => {
    const onSubmit = vi.fn();
    render(
      <>
        <form
          id="profile"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <label>
            이름
            <input name="name" defaultValue="밤별" />
          </label>
        </form>
        <FormActions aria-label="저장 영역" contentClassName="max-w-3xl">
          <Button type="submit" form="profile">
            저장
          </Button>
        </FormActions>
      </>,
    );
    await userEvent.setup().click(screen.getByRole('button', { name: '저장' }));
    expect(onSubmit).toHaveBeenCalledOnce();
    expect(screen.getByLabelText('저장 영역')).toHaveAttribute('data-sticky-cta');
  });
});
