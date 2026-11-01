import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { z } from 'zod';

import type { TCoachingDetails } from '@game-feedback/contracts';

import { useZodForm } from '@/shared/model/form';

import { postComposerSchema } from '../model/post-composer.schema';
import { CoachingFields } from './CoachingFields';

type TComposerValues = z.output<typeof postComposerSchema>;

function CoachingForm({
  onSubmit,
  coaching = { role: 'COACH', pricing: { type: 'HOURLY', amount: null } },
}: {
  onSubmit: (values: TComposerValues) => void;
  coaching?: TCoachingDetails;
}) {
  const form = useZodForm(postComposerSchema, {
    defaultValues: {
      title: '코칭 연습 모집',
      body: '함께 연습해요.',
      categoryId: 'category-1',
      board: 'COACHING',
      editorValid: true,
      coaching,
    },
  });
  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      <CoachingFields form={form} />
      <button type="submit">저장</button>
    </form>
  );
}

describe('coaching radio choices', () => {
  it('exposes both roles and every fee basis, updates labels, and submits the chosen values', async () => {
    const onSubmit = vi.fn<(values: TComposerValues) => void>();
    render(<CoachingForm onSubmit={onSubmit} />);
    const roles = screen.getByRole('group', { name: '모집 유형' });
    const pricing = screen.getByRole('group', { name: '수강료 기준' });
    expect(within(roles).getAllByRole('radio')).toHaveLength(2);
    expect(within(pricing).getAllByRole('radio')).toHaveLength(3);
    expect(screen.getByRole<HTMLInputElement>('radio', { name: '수강생 모집' }).checked).toBe(true);
    expect(screen.getByRole<HTMLInputElement>('radio', { name: '시간당' }).checked).toBe(true);

    fireEvent.click(screen.getByRole('radio', { name: '코치 구함' }));
    fireEvent.change(screen.getByLabelText('시간당 희망 수강료 (원)'), { target: { value: '30000' } });
    fireEvent.click(screen.getByRole('radio', { name: '기간 단위' }));
    expect(screen.getByLabelText<HTMLInputElement>('기간 희망 수강료 (원)').value).toBe('30000');
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(onSubmit.mock.calls[0]?.[0].coaching).toEqual({
      role: 'STUDENT',
      pricing: { type: 'MONTHLY', amount: 30000 },
    });
  });

  it('reflects saved goal pricing and removes hidden goal data while retaining the amount', async () => {
    const onSubmit = vi.fn<(values: TComposerValues) => void>();
    render(
      <CoachingForm
        onSubmit={onSubmit}
        coaching={{ role: 'STUDENT', pricing: { type: 'GOAL', amount: 500000, targetScore: '9,000 트로피' } }}
      />,
    );
    expect(screen.getByRole<HTMLInputElement>('radio', { name: '코치 구함' }).checked).toBe(true);
    expect(screen.getByRole<HTMLInputElement>('radio', { name: '목표 달성까지' }).checked).toBe(true);
    expect(screen.getByLabelText<HTMLInputElement>('목표 점수').value).toBe('9,000 트로피');
    fireEvent.click(screen.getByRole('radio', { name: '시간당' }));
    expect(screen.queryByLabelText('목표 점수')).toBeNull();
    expect(screen.getByLabelText<HTMLInputElement>('시간당 희망 수강료 (원)').value).toBe('500000');
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(onSubmit.mock.calls[0]?.[0].coaching).toEqual({
      role: 'STUDENT',
      pricing: { type: 'HOURLY', amount: 500000 },
    });
  });

  it('validates a newly chosen goal and clears its error when switching to a period fee', async () => {
    const onSubmit = vi.fn<(values: TComposerValues) => void>();
    render(<CoachingForm onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('radio', { name: '목표 달성까지' }));
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      '목표 점수를 1~100자로 입력해주세요.',
    );
    expect(screen.getByLabelText('목표 점수').getAttribute('aria-invalid')).toBe('true');
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('radio', { name: '기간 단위' }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(screen.queryByLabelText('목표 점수')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(onSubmit.mock.calls[0]?.[0].coaching).toEqual({
      role: 'COACH',
      pricing: { type: 'MONTHLY', amount: null },
    });
    fireEvent.click(screen.getByRole('radio', { name: '목표 달성까지' }));
    expect(screen.getByLabelText<HTMLInputElement>('목표 점수').value).toBe('');
  });
});
