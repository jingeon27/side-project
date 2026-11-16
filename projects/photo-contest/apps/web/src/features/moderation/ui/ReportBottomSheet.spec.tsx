import { ApolloClient, ApolloLink, InMemoryCache, Observable } from '@apollo/client';
import { ApolloProvider } from '@apollo/client/react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent, type UserEvent } from '@testing-library/user-event';
import { overlay, OverlayProvider } from 'overlay-kit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createErrorToastLink } from '@/shared/api/apollo-link.helper';
import { trackEvent } from '@/shared/model/analytics';
import { hasOpenOverlay } from '@/shared/model/router';
import { toast } from '@/shared/model/toast';

import { ReportBottomSheet } from './ReportBottomSheet';

vi.mock('@/shared/model/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/model/analytics')>()),
  trackEvent: vi.fn(),
}));

interface IReportRequest {
  variables: Record<string, unknown>;
  succeed: () => void;
  failNetwork: () => void;
}

/** 신고 요청을 테스트가 응답할 때까지 붙잡아 제출 중 상태를 확인한다. */
function createReportLink() {
  const requests: IReportRequest[] = [];
  const link = new ApolloLink(
    (operation) =>
      new Observable((sink) => {
        requests.push({
          variables: operation.variables,
          succeed: () => {
            sink.next({ data: { reportSubmission: true } });
            sink.complete();
          },
          failNetwork: () => sink.error(new TypeError('Failed to fetch')),
        });
      }),
  );
  return { link, requests };
}

/** 사진 카드의 신고 버튼(ModerationActions)처럼 overlay-kit으로 시트를 연다. */
async function openSheet() {
  const user = userEvent.setup();
  const { link, requests } = createReportLink();
  const client = new ApolloClient({
    cache: new InMemoryCache(),
    link: ApolloLink.from([createErrorToastLink((message) => toast.error(message)), link]),
  });
  render(
    <ApolloProvider client={client}>
      <OverlayProvider>
        <button
          type="button"
          onClick={() =>
            overlay.open(({ isOpen, close: onClose, unmount }) => (
              <ReportBottomSheet
                contestId="contest-1"
                submissionId="photo-a"
                isOpen={isOpen}
                onClose={onClose}
                unmount={unmount}
              />
            ))
          }
        >
          신고
        </button>
      </OverlayProvider>
    </ApolloProvider>,
  );
  const opener = screen.getByRole('button', { name: '신고' });
  await user.click(opener);
  const sheet = await screen.findByRole('dialog', { name: '사진 신고하기' });
  return {
    user,
    requests,
    opener,
    sheet,
    reason: within(sheet).getByRole('textbox', { name: '신고 이유' }),
    submit: within(sheet).getByRole('button', { name: '신고 제출' }),
  };
}

const REPORT = { submissionId: 'photo-a', reason: '동의 없이 올린 사진' };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(toast, 'success');
  vi.spyOn(toast, 'error');
});

afterEach(() => {
  act(() => overlay.unmountAll());
});

describe('ReportBottomSheet', () => {
  it.each<[string, (user: UserEvent, sheet: HTMLElement) => Promise<void>]>([
    ['취소 버튼', (user, sheet) => user.click(within(sheet).getByRole('button', { name: '취소' }))],
    ['Esc', (user) => user.keyboard('{Escape}')],
    [
      '뒤로 가기',
      async () => {
        await waitFor(() => expect(hasOpenOverlay()).toBe(true));
        act(() => window.history.back());
      },
    ],
  ])(
    '안내를 읽어 주는 시트로 포커스를 옮겨 열리고, %s로 닫으면 신고 없이 신고 버튼으로 포커스를 돌려야 한다',
    async (_, dismiss) => {
      const { user, requests, opener, sheet, reason } = await openSheet();
      expect(sheet).toHaveAccessibleDescription('신고 내용은 그룹 관리자만 확인할 수 있어요.');
      expect(reason).toBeRequired();
      // Base UI Drawer는 입력이 아니라 시트 자체에 처음 포커스를 둬 모바일 키보드가 바로 올라오지 않는다.
      await waitFor(() => expect(sheet).toHaveFocus());

      await user.type(reason, '동의 없이 올린 사진');
      await dismiss(user, sheet);

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      await waitFor(() => expect(opener).toHaveFocus());
      expect(requests).toHaveLength(0);
    },
  );

  it('공백만 적고 제출하면 요청 없이 신고 이유를 오류 상태로 읽어 주고, 내용을 적으면 오류를 지워야 한다', async () => {
    const { user, requests, reason, submit } = await openSheet();

    await user.type(reason, '   ');
    await user.click(submit);

    await waitFor(() => expect(reason).toHaveAttribute('aria-invalid', 'true'));
    expect(reason).toHaveAccessibleDescription('신고 이유를 입력해 주세요.');
    expect(reason).toHaveFocus();
    expect(requests).toHaveLength(0);

    await user.type(reason, '동의 없이 올린 사진');
    await waitFor(() => expect(reason).not.toHaveAttribute('aria-invalid'));
    expect(reason).toHaveAccessibleDescription('');
  });

  it('제출 중에는 버튼을 잠가 다시 눌러도 한 번만 보내고, 접수되면 안내한 뒤 닫혀 신고 버튼으로 포커스를 돌려야 한다', async () => {
    const { user, requests, opener, reason, submit } = await openSheet();
    await user.type(reason, ' 동의 없이 올린 사진 ');
    expect(submit).not.toHaveAttribute('aria-busy');

    await user.click(submit);
    await waitFor(() => expect(submit).toHaveAttribute('aria-busy', 'true'));
    expect(submit).toHaveAttribute('aria-disabled', 'true');
    await user.click(submit);
    expect(requests).toHaveLength(1);
    expect(requests[0]!.variables).toEqual(REPORT);
    expect(toast.success).not.toHaveBeenCalled();

    await act(async () => requests[0]!.succeed());

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(toast.success).toHaveBeenCalledExactlyOnceWith('신고를 접수했어요', {
      description: '그룹 관리자가 확인할게요.',
    });
    expect(trackEvent).toHaveBeenCalledExactlyOnceWith('photo_reported', { contest_id: 'contest-1' });
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it('제출이 실패하면 오류를 알리고 시트와 적은 내용을 남겨 다시 제출할 수 있어야 한다', async () => {
    const { user, requests, reason, submit } = await openSheet();
    await user.type(reason, ' 동의 없이 올린 사진 ');
    await user.click(submit);
    await waitFor(() => expect(requests).toHaveLength(1));

    await act(async () => requests[0]!.failNetwork());

    await waitFor(() => expect(submit).not.toHaveAttribute('aria-busy'));
    expect(toast.error).toHaveBeenCalledExactlyOnceWith('네트워크 연결을 확인하고 다시 시도해 주세요.');
    expect(screen.getByRole('dialog', { name: '사진 신고하기' })).toBeVisible();
    expect(reason).toHaveValue(' 동의 없이 올린 사진 ');
    expect(submit).toBeEnabled();
    expect(toast.success).not.toHaveBeenCalled();
    expect(trackEvent).not.toHaveBeenCalled();

    await user.click(submit);
    await waitFor(() => expect(requests).toHaveLength(2));
    expect(requests[1]!.variables).toEqual(REPORT);
    await act(async () => requests[1]!.succeed());

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(toast.success).toHaveBeenCalledExactlyOnceWith('신고를 접수했어요', expect.anything());
  });

  it('제출 중에도 취소를 잠그지 않고 바깥을 눌러 닫을 수 있으며, 닫은 뒤 신고가 접수되면 접수 안내를 보여 줘야 한다', async () => {
    const { user, requests, sheet, reason, submit } = await openSheet();
    await user.type(reason, '동의 없이 올린 사진');
    await user.click(submit);
    await waitFor(() => expect(submit).toHaveAttribute('aria-busy', 'true'));
    expect(within(sheet).getByRole('button', { name: '취소' })).toBeEnabled();

    // 배경은 역할이 없는 장식이라 data-slot으로 찾는다. 바깥 누르기 뒤 포커스 복귀는 브라우저의
    // focus({ preventScroll }) 지원에 따라 Base UI가 정하므로 jsdom에서는 확인하지 않는다.
    await user.click(document.querySelector<HTMLElement>('[data-slot="bottom-sheet-backdrop"]')!);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(toast.success).not.toHaveBeenCalled();

    // 닫힌 시트에는 결과를 보여 줄 곳이 없으므로 토스트가 유일한 접수 안내다.
    await act(async () => requests[0]!.succeed());

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledExactlyOnceWith('신고를 접수했어요', expect.anything()),
    );
    expect(trackEvent).toHaveBeenCalledExactlyOnceWith('photo_reported', { contest_id: 'contest-1' });
    expect(requests).toHaveLength(1);
  });
});
