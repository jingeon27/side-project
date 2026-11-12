import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { openContest, renderContestForm, submitLinkPost } from '../../../../../test/fixtures/group-contests';

describe('마감된 대회 링크로 연 글쓰기', () => {
  it('접수 중인 대회가 없으면 마감을 알리고 대회 없이 게시해야 한다', async () => {
    const { user, posts } = await renderContestForm({ defaultContestId: 'closed-contest', contests: [] });
    expect(await screen.findByText(/참여하려던 대회는 접수가 끝나서/)).toHaveAttribute('role', 'status');
    await submitLinkPost(user, '마감 뒤에 쓴 글');
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).not.toHaveProperty('contestId');
  });

  it('다른 대회만 접수 중이면 참여를 끈 채로 알리고 대회 없이 게시해야 한다', async () => {
    const { user, posts } = await renderContestForm({
      defaultContestId: 'closed-contest',
      contests: [openContest('open-1', '겨울 대회')],
    });
    expect(await screen.findByText(/참여하려던 대회는 접수가 끝났어요/)).toBeVisible();
    await waitFor(() => expect(screen.getByRole('checkbox', { name: /대회에 참여하기/ })).not.toBeChecked());
    await submitLinkPost(user, '마감 뒤에 쓴 글');
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).not.toHaveProperty('contestId');
  });
});
