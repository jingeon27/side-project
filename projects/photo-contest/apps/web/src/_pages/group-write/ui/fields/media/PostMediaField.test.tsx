import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { expect, it } from 'vitest';

import { useZodForm } from '@/shared/model/form';

import { postSchema } from '../../../model/post.schema';
import { PostMediaField } from './PostMediaField';

const RULE = /링크 중 하나 이상/;

function MediaField() {
  // 글쓰기 폼처럼 빈 값을 채워야 첨부 규칙까지 검사한다.
  const form = useZodForm(postSchema, {
    defaultValues: { title: '', body: '', media: null, linkUrl: '', rightsConfirmed: false },
  });
  return (
    <>
      <PostMediaField control={form.control} trigger={form.trigger} />
      <button type="button" onClick={() => void form.trigger('media')}>
        첨부 확인
      </button>
    </>
  );
}

it('링크만 올려도 된다는 규칙을 필수 표시와 함께, 파일 선택보다 먼저 알려야 한다', () => {
  render(<MediaField />);
  const input = screen.getByLabelText('사진 또는 동영상 선택');
  expect(input).toHaveAttribute('aria-required', 'true');
  expect(input).toHaveAccessibleDescription(RULE);
  const rule = screen.getByText(RULE);
  const picker = screen.getByRole('button', { name: /^파일 선택/ });
  expect(rule.compareDocumentPosition(picker) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

it('첨부가 없다는 오류가 보이는 동안에는 같은 뜻의 규칙을 겹쳐 보이거나 읽지 않아야 한다', async () => {
  const user = userEvent.setup({ applyAccept: false });
  render(<MediaField />);
  const input = screen.getByLabelText('사진 또는 동영상 선택');
  await user.click(screen.getByRole('button', { name: '첨부 확인' }));
  expect(await screen.findByText('사진이나 동영상, 링크를 하나 이상 첨부해 주세요.')).toHaveAttribute(
    'role',
    'alert',
  );
  expect(screen.queryByText(RULE)).not.toBeInTheDocument();
  expect(input).toHaveAccessibleDescription(/링크를 하나 이상 첨부해 주세요/);
  expect(input).not.toHaveAccessibleDescription(RULE);

  // 파일의 형식 오류는 규칙과 다른 말이라 규칙을 그대로 보여 준다.
  await user.upload(input, new File(['memo'], 'memo.txt', { type: 'text/plain' }));
  expect(await screen.findByText('사진이나 MP4, WebM 형식의 동영상을 선택해 주세요.')).toBeVisible();
  expect(screen.getByText(RULE)).toBeVisible();
  expect(input).toHaveAccessibleDescription(RULE);
});
