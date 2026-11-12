import { ApolloClient, ApolloLink, InMemoryCache } from '@apollo/client';
import { ApolloProvider, useBackgroundQuery } from '@apollo/client/react';
import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { GroupProfileDocument, GroupRole } from '@/shared/api/generated';

import { EditGroupProfileForm } from './EditGroupProfileForm';

function renderForm() {
  const client = new ApolloClient({ cache: new InMemoryCache(), link: ApolloLink.empty() });
  client.writeQuery({
    query: GroupProfileDocument,
    variables: { id: 'group-1' },
    data: {
      group: {
        __typename: 'Group',
        id: 'group-1',
        name: '웃음 연구소',
        description: '함께 웃긴 순간을 나눠요.',
        avatarUrl: null,
        coverUrl: null,
        role: GroupRole.Owner,
      },
    },
  });
  const onSaved = vi.fn();
  const onCancel = vi.fn();
  function Form() {
    const [queryRef] = useBackgroundQuery(GroupProfileDocument, { variables: { id: 'group-1' } });
    return <EditGroupProfileForm queryRef={queryRef} onSaved={onSaved} onCancel={onCancel} />;
  }
  render(
    <ApolloProvider client={client}>
      <Form />
    </ApolloProvider>,
  );
  return { user: userEvent.setup(), onSaved, onCancel };
}

describe('그룹 프로필 수정 페이지의 폼', () => {
  it('기존 이름과 소개를 채우고 선택 사진은 접어 둬야 한다', async () => {
    const { user } = renderForm();
    expect(screen.getByLabelText('그룹 이름')).toHaveValue('웃음 연구소');
    expect(screen.getByLabelText('그룹 소개')).toHaveValue('함께 웃긴 순간을 나눠요.');
    const summary = screen.getByText('그룹 사진 변경');
    expect(summary.closest('details')).not.toHaveAttribute('open');
    // 브라우저 기본 ▶ 대신 공통 펼침 화살표를 쓴다(V18).
    expect(summary.closest('summary')).toHaveAttribute('data-slot', 'disclosure-trigger');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(summary);
    expect(summary.closest('details')).toHaveAttribute('open');
    expect(screen.getByText('그룹 배경 사진')).toBeVisible();
    expect(screen.getByText('그룹 사진')).toBeVisible();
  });

  it('그룹 사진은 그룹 아바타와 같은 둥근 사각형으로 미리 보여야 한다', async () => {
    const { user } = renderForm();
    await user.click(screen.getByText('그룹 사진 변경'));
    // 그룹은 둥근 사각형, 사람은 원이라는 아바타 규칙(V15)을 사진 선택 미리보기도 따른다.
    const preview = screen.getByLabelText('그룹 사진 선택').closest('label');
    expect(preview).toHaveClass('rounded-card');
    expect(preview).not.toHaveClass('rounded-full');
  });

  it('이름이 비면 저장하지 않고 이름으로 포커스를 옮겨야 한다', async () => {
    const { user, onSaved } = renderForm();
    await user.clear(screen.getByLabelText('그룹 이름'));
    await user.click(screen.getByRole('button', { name: '프로필 저장하기' }));
    expect(await screen.findByText('그룹 이름을 입력해 주세요.')).toBeVisible();
    expect(screen.getByLabelText('그룹 이름')).toHaveFocus();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('취소는 수정 내용을 저장하지 않고 그룹으로 돌아가야 한다', async () => {
    const { user, onSaved, onCancel } = renderForm();
    await user.type(screen.getByLabelText('그룹 소개'), ' 저장하지 않을 내용');
    await user.click(screen.getByRole('button', { name: '취소' }));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onSaved).not.toHaveBeenCalled();
  });
});
