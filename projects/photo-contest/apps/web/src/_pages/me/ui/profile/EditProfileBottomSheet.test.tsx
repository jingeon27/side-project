import { ApolloClient, InMemoryCache } from '@apollo/client';
import { ApolloProvider } from '@apollo/client/react';
import { MockLink } from '@apollo/client/testing';
import { act, render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { overlay, OverlayProvider } from 'overlay-kit';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MeDocument } from '@/shared/api/generated';

import { EditProfileBottomSheet } from './EditProfileBottomSheet';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

/** `delay`를 Infinity로 주면 응답이 오지 않아 불러오는 동안의 화면이 남는다. */
async function openSheet(delay?: number) {
  const user = userEvent.setup();
  const client = new ApolloClient({
    cache: new InMemoryCache(),
    link: new MockLink([
      {
        request: { query: MeDocument },
        delay,
        result: {
          data: {
            me: {
              __typename: 'User',
              id: 'me',
              nickname: '웃음',
              avatar: null,
              isAnonymous: false,
              needsOnboarding: false,
            },
          },
        },
      },
    ]),
  });
  render(
    <ApolloProvider client={client}>
      <OverlayProvider>
        <button
          onClick={() =>
            overlay.open(({ isOpen, close: onClose, unmount }) => (
              <EditProfileBottomSheet isOpen={isOpen} onClose={onClose} unmount={unmount} />
            ))
          }
        >
          열기
        </button>
      </OverlayProvider>
    </ApolloProvider>,
  );
  await user.click(screen.getByRole('button', { name: '열기' }));
  return screen.findByRole('dialog', { name: '프로필 수정' });
}

afterEach(() => {
  act(() => overlay.unmountAll());
});

// 포커스 링은 두께 3px와 간격 2px로 요소 밖 5px까지 그려진다. 스크롤 본문은 안쪽 여백 밖을 좌우까지 잘라
// 좌우 여백이 0이던 이 시트에서 닉네임 입력창과 사진 선택의 링이 잘렸다.
describe('EditProfileBottomSheet', () => {
  it('스크롤 본문은 폼 폭을 바꾸지 않고 좌우에 포커스 링이 들어갈 안쪽 여백을 둬야 한다', async () => {
    const sheet = await openSheet();
    const nickname = await within(sheet).findByRole('textbox', { name: /닉네임/ });
    const body = sheet.querySelector('[data-slot="bottom-sheet-body"]');
    expect(body).toContainElement(nickname);
    expect(body).toContainElement(within(sheet).getByLabelText('프로필 사진 선택'));
    // 시트 좌우 여백(px-5) 안으로 6px 넓히고 같은 6px을 안쪽 여백으로 둔다.
    expect(body).toHaveClass('-mx-1.5', 'px-1.5');
    expect(body).not.toHaveClass('px-0');
  });

  it('불러오는 동안 자리표시는 스크롤 본문 상자와 같이 제목에서 20px 떨어져야 한다', async () => {
    const sheet = await openSheet(Infinity);
    const header = sheet.querySelector('[data-slot="bottom-sheet-header"]');
    // 제목 영역 아래 여백 14px에 본문 위쪽 여백 6px을 더해 20px이 된다. 자리표시는 본문 밖에 놓여 6px을 직접 둔다.
    expect(header?.nextElementSibling).toHaveClass('animate-pulse', 'mt-1.5');
    expect(sheet.querySelector('[data-slot="bottom-sheet-body"]')).toBeNull();
  });

  // 시트 좌우 여백(px-5) 안에서 mx-5를 한 번 더 써서, 불러오는 동안 자리표시가 제목·폼보다 20px씩 안쪽에 있었다.
  it('불러오는 동안 자리표시는 제목·폼과 같은 가로 상자에 있어야 한다', async () => {
    const sheet = await openSheet(Infinity);
    const header = sheet.querySelector('[data-slot="bottom-sheet-header"]');
    const placeholder = header?.nextElementSibling;
    expect(placeholder).toHaveClass('animate-pulse');
    // 폼도 mx-auto w-full max-w-app이고 본문은 -mx-1.5 px-1.5라 가로 위치가 같다.
    const horizontalBox = (element: Element | null | undefined) =>
      [...(element?.classList ?? [])].filter((name) => /^-?(mx|w|max-w)-/.test(name)).sort();
    expect(horizontalBox(placeholder)).toEqual(['max-w-app', 'mx-auto', 'w-full']);
    expect(horizontalBox(header)).toEqual(horizontalBox(placeholder));
  });
});
