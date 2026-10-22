import { lazy, memo, Suspense, type ComponentProps } from 'react';

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Input } from '../input/Input';
import { NativeSelect, NativeSelectOption } from '../native-select/NativeSelect';
import { Textarea } from '../textarea/Textarea';
import { FormField } from './FormField';

const MemoInput = memo(Input);
// 서버 컴포넌트가 넘긴 클라이언트 컴포넌트는 lazy 참조로 도착해 자식 타입 비교로는 찾을 수 없다.
const LazyTextarea = lazy(async () => ({ default: Textarea }));

function PriceInput(props: ComponentProps<typeof Input>) {
  return (
    <span className="flex items-center gap-2">
      <Input inputMode="numeric" {...props} />원
    </span>
  );
}

describe('FormField', () => {
  it('memo·래퍼·lazy를 거친 입력도 레이블·도움말·오류를 연결해야 한다', async () => {
    render(
      <>
        <FormField label="닉네임" hint="2~12자">
          <MemoInput />
        </FormField>
        <FormField label="판매 금액" error="금액을 확인해주세요">
          <PriceInput />
        </FormField>
        <Suspense fallback={null}>
          <FormField label="소개" hint="자유롭게 적어 주세요">
            <LazyTextarea />
          </FormField>
        </Suspense>
      </>,
    );

    expect(screen.getByRole('textbox', { name: '닉네임' })).toHaveAccessibleDescription('2~12자');
    const price = screen.getByRole('textbox', { name: '판매 금액' });
    expect(price).toHaveAttribute('aria-invalid', 'true');
    expect(price).toHaveAccessibleDescription('금액을 확인해주세요');
    expect(await screen.findByRole('textbox', { name: '소개' })).toHaveAccessibleDescription(
      '자유롭게 적어 주세요',
    );
  });

  it('소비자가 넘긴 aria-labelledby·aria-label·aria-describedby를 덮어쓰지 않아야 한다', () => {
    render(
      <>
        <span id="external-label">외부 레이블</span>
        <span id="external-hint">외부 도움말</span>
        <FormField label="필드 레이블" hint="필드 도움말">
          <Input aria-labelledby="external-label" aria-describedby="external-hint" />
        </FormField>
        <FormField label="게임">
          <Input readOnly aria-label="선택한 게임" defaultValue="브롤스타즈" />
        </FormField>
      </>,
    );

    const labelled = screen.getByRole('textbox', { name: '외부 레이블' });
    expect(labelled).toHaveAttribute('aria-labelledby', 'external-label');
    expect(labelled).toHaveAccessibleDescription('외부 도움말 필드 도움말');
    expect(screen.getByRole('textbox', { name: '선택한 게임' })).not.toHaveAttribute('aria-labelledby');
  });

  it('직접 자식인 native 입력도 연결하고 label 안에 div를 넣지 않아야 한다', () => {
    const { container } = render(
      <>
        <FormField label="이메일" error="형식을 확인해주세요">
          <input type="email" />
        </FormField>
        <FormField label="분류" hint="하나를 고르세요">
          <NativeSelect defaultValue="FREE">
            <NativeSelectOption value="FREE">자유게시판</NativeSelectOption>
          </NativeSelect>
        </FormField>
      </>,
    );

    const email = screen.getByRole('textbox', { name: '이메일' });
    expect(email).toHaveAttribute('aria-invalid', 'true');
    expect(email).toHaveAccessibleDescription('형식을 확인해주세요');
    expect(screen.getByRole('combobox', { name: '분류' })).toHaveAccessibleDescription('하나를 고르세요');
    expect(container.querySelector('label div')).toBeNull();
  });

  it('FormField 밖의 입력에는 연결 속성을 붙이지 않아야 한다', () => {
    render(<Input aria-label="검색어" />);
    const input = screen.getByRole('textbox', { name: '검색어' });
    expect(input).not.toHaveAttribute('aria-labelledby');
    expect(input).not.toHaveAttribute('aria-describedby');
    expect(input).not.toHaveAttribute('aria-invalid');
  });
});
