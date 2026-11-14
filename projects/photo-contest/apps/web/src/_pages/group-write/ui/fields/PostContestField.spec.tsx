import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { openContest, renderContestForm, submitLinkPost } from '../../../../../test/fixtures/group-contests';

describe('대회 참여 선택', () => {
  it('접수 중인 대회 링크로 열면 그 대회를 고른 채로 게시해야 한다', async () => {
    const { user, posts } = await renderContestForm({
      defaultContestId: 'open-1',
      contests: [openContest('open-1', '겨울 대회')],
    });
    expect(await screen.findByRole('combobox', { name: '참여할 대회' })).toHaveValue('open-1');
    expect(screen.getByRole('checkbox', { name: /대회에 참여하기/ })).toBeChecked();
    expect(screen.queryByText(/참여하려던 대회는/)).not.toBeInTheDocument();
    await submitLinkPost(user, '대회에 낼 글');
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toMatchObject({ contestId: 'open-1' });
  });

  it('접수 중인 대회가 더 남아 있으면 첫 목록에 없는 링크의 대회를 마감으로 보지 않아야 한다', async () => {
    const { user, posts } = await renderContestForm({
      defaultContestId: 'later-contest',
      contests: [openContest('open-1', '겨울 대회')],
      nextOffset: 1,
    });
    expect(await screen.findByRole('button', { name: '대회 더 불러오기' })).toBeVisible();
    expect(screen.getByRole('checkbox', { name: /대회에 참여하기/ })).toBeChecked();
    expect(screen.queryByText(/참여하려던 대회는/)).not.toBeInTheDocument();
    await submitLinkPost(user, '대회에 낼 글');
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toMatchObject({ contestId: 'later-contest' });
  });

  it('마감된 대회 대신 고른 대회는 글쓰기를 감췄다 다시 보여도 그대로 둬야 한다', async () => {
    const { user, posts, show } = await renderContestForm({
      defaultContestId: 'closed-contest',
      contests: [openContest('open-1', '겨울 대회'), openContest('open-2', '봄 대회')],
    });
    const participate = await screen.findByRole('checkbox', { name: /대회에 참여하기/ });
    await waitFor(() => expect(participate).not.toBeChecked());
    await user.click(participate);
    await user.selectOptions(screen.getByRole('combobox', { name: '참여할 대회' }), 'open-2');

    show('hidden');
    expect(screen.queryByRole('form', { name: '그룹에 글쓰기' })).not.toBeInTheDocument();
    show('visible');

    expect(screen.getByRole('checkbox', { name: /대회에 참여하기/ })).toBeChecked();
    expect(screen.getByRole('combobox', { name: '참여할 대회' })).toHaveValue('open-2');
    await submitLinkPost(user, '대회에 낼 글');
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toMatchObject({ contestId: 'open-2' });
  });

  it('참여를 켜고 대회를 고르지 않으면 대회 칸에 오류를 이어 알려야 한다', async () => {
    const { user, posts } = await renderContestForm({ contests: [openContest('open-1', '겨울 대회')] });
    await user.click(await screen.findByRole('checkbox', { name: /대회에 참여하기/ }));
    await submitLinkPost(user, '대회에 낼 글');
    const select = screen.getByRole('combobox', { name: '참여할 대회' });
    await waitFor(() => expect(select).toHaveAttribute('aria-invalid', 'true'));
    expect(select).toHaveAccessibleDescription('참여할 대회를 선택해 주세요.');
    expect(select).toHaveFocus();
    expect(posts).toEqual([]);
  });
});
