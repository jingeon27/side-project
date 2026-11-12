import { ApolloClient, InMemoryCache } from '@apollo/client';
import { ApolloProvider } from '@apollo/client/react';
import { MockLink } from '@apollo/client/testing';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { overlay, OverlayProvider } from 'overlay-kit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { decodeWebMessage } from '@photo-contest/bridge';
import { installFakeNativeApp, type IFakeNativeApp } from '@photo-contest/bridge/test';
import { createWebBridge, type IWebBridge, type TBridgeWindow } from '@photo-contest/bridge/web';

import { MeDocument } from '@/shared/api/generated';
import { registerLeaveGuard, routeHistoryStore } from '@/shared/model/router';
import { hasOpenOverlay, pushOverlayEntry } from '@/shared/model/router/overlay-history.store';
import { registerParentRoute } from '@/shared/model/router/parent-route.store';
import { ConfirmDialog } from '@/shared/ui/@core/confirm-dialog';

import { BridgeProvider } from './BridgeProvider';

const navigation = vi.hoisted(() => ({
  pathname: '/',
  router: {
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
    forward: vi.fn(),
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => navigation.router,
  usePathname: () => navigation.pathname,
}));

let fake: IFakeNativeApp;
let bridge: IWebBridge;
let posted: unknown[];

function renderProvider(client = new ApolloClient({ cache: new InMemoryCache(), link: new MockLink([]) })) {
  const view = render(
    <ApolloProvider client={client}>
      <BridgeProvider bridge={bridge}>화면</BridgeProvider>
    </ApolloProvider>,
  );
  return { ...view, client };
}

function goTo(path: string) {
  window.history.replaceState(null, '', path);
  navigation.pathname = new URL(path, window.location.origin).pathname;
}

beforeEach(() => {
  vi.clearAllMocks();
  goTo('/');
  routeHistoryStore.start('navigate');
  fake = installFakeNativeApp(window, { capabilities: {} });
  posted = [];
  // 웹이 앱으로 보낸 메시지를 기록한다.
  const win: TBridgeWindow = window;
  const native = win.ReactNativeWebView;
  win.ReactNativeWebView = {
    postMessage: (raw: string) => {
      posted.push(decodeWebMessage(raw));
      native?.postMessage(raw);
    },
  };
  bridge = createWebBridge(window);
});

afterEach(() => {
  bridge.dispose();
  fake.uninstall();
});

const events = () =>
  posted.filter(
    (message): message is { kind: 'event'; type: string; payload: unknown } =>
      typeof message === 'object' && message !== null && Reflect.get(message, 'kind') === 'event',
  );

describe('BridgeProvider', () => {
  it('마운트되면 app.ready를, 경로가 바뀌면 navigation.changed를 앱에 알려야 한다', () => {
    goTo('/groups/g1?tab=members');
    const view = renderProvider();
    expect(events()).toEqual([
      expect.objectContaining({ type: 'app.ready', payload: { path: '/groups/g1?tab=members' } }),
    ]);

    goTo('/contests/c1');
    view.rerender(
      <ApolloProvider client={view.client}>
        <BridgeProvider bridge={bridge}>화면</BridgeProvider>
      </ApolloProvider>,
    );
    expect(events().map(({ type }) => type)).toEqual(['app.ready', 'navigation.changed']);
    expect(events()[1]?.payload).toEqual({ path: '/contests/c1' });
  });

  it('앱 뒤로 가기는 열린 오버레이를 먼저 닫아야 한다', async () => {
    renderProvider();
    const closeSheet = vi.fn();
    pushOverlayEntry(closeSheet);

    await expect(fake.router.requestWeb('navigation.back', {})).resolves.toEqual({ handled: true });
    await waitFor(() => expect(closeSheet).toHaveBeenCalledOnce());
    expect(hasOpenOverlay()).toBe(false);
    expect(navigation.router.back).not.toHaveBeenCalled();
  });

  it('앱 안 기록이 있으면 이전 화면으로 돌아가야 한다', async () => {
    goTo('/contests/c1');
    renderProvider();
    routeHistoryStore.record('/contests/c1');

    await expect(fake.router.requestWeb('navigation.back', {})).resolves.toEqual({ handled: true });
    expect(navigation.router.back).toHaveBeenCalledOnce();
  });

  it('링크로 바로 들어온 화면이면 상위 화면으로 바꿔야 한다', async () => {
    goTo('/contests/c1');
    renderProvider();
    const release = registerParentRoute('/contests/c1', '/groups/g1');

    await expect(fake.router.requestWeb('navigation.back', {})).resolves.toEqual({ handled: true });
    expect(navigation.router.replace).toHaveBeenCalledWith('/groups/g1', undefined);
    release();
  });

  describe('떠나기 전 확인을 등록한 화면', () => {
    /** 글쓰기 화면처럼 대화상자로 버릴지 묻는 확인을 등록한다. */
    function renderGuardedPage(path: string) {
      goTo(path);
      render(
        <ApolloProvider client={new ApolloClient({ cache: new InMemoryCache(), link: new MockLink([]) })}>
          <BridgeProvider bridge={bridge}>
            <OverlayProvider>화면</OverlayProvider>
          </BridgeProvider>
        </ApolloProvider>,
      );
      const release = registerLeaveGuard(path, () =>
        overlay.openAsync<boolean>(({ isOpen, close, unmount }) => (
          <ConfirmDialog
            isOpen={isOpen}
            onClose={() => close(false)}
            unmount={unmount}
            title="작성 중인 글을 버릴까요?"
            confirmLabel="글 버리고 나가기"
            cancelLabel="계속 쓰기"
            tone="danger"
            onConfirm={() => close(true)}
          />
        )),
      );
      return { user: userEvent.setup(), release };
    }

    afterEach(() => act(() => overlay.unmountAll()));

    it('앱 뒤로 가기는 묻는 동안 처리했다고 답하고, 버리기를 고른 뒤에만 이전 화면으로 가야 한다', async () => {
      const { user, release } = renderGuardedPage('/groups/g1/write');
      routeHistoryStore.record('/groups/g1/write');

      await expect(fake.router.requestWeb('navigation.back', {})).resolves.toEqual({ handled: true });
      const dialog = await screen.findByRole('alertdialog', { name: '작성 중인 글을 버릴까요?' });
      expect(navigation.router.back).not.toHaveBeenCalled();

      await user.click(within(dialog).getByRole('button', { name: '글 버리고 나가기' }));
      await waitFor(() => expect(navigation.router.back).toHaveBeenCalledOnce());
      expect(hasOpenOverlay()).toBe(false);
      release();
    });

    it('묻는 동안 앱 뒤로 가기를 다시 누르면 대화상자만 닫고 화면에 남아야 한다', async () => {
      const { release } = renderGuardedPage('/groups/g1/write');
      routeHistoryStore.record('/groups/g1/write');

      await expect(fake.router.requestWeb('navigation.back', {})).resolves.toEqual({ handled: true });
      await screen.findByRole('alertdialog', { name: '작성 중인 글을 버릴까요?' });
      await waitFor(() => expect(hasOpenOverlay()).toBe(true));
      await expect(fake.router.requestWeb('navigation.back', {})).resolves.toEqual({ handled: true });

      await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
      expect(navigation.router.back).not.toHaveBeenCalled();
      expect(navigation.router.replace).not.toHaveBeenCalled();
      release();
    });

    it('링크로 바로 들어온 화면도 버리기를 고른 뒤에만 상위 화면으로 바꿔야 한다', async () => {
      const { user, release } = renderGuardedPage('/groups/g1/write');
      const releaseParent = registerParentRoute('/groups/g1/write', '/groups/g1');

      await expect(fake.router.requestWeb('navigation.back', {})).resolves.toEqual({ handled: true });
      const dialog = await screen.findByRole('alertdialog', { name: '작성 중인 글을 버릴까요?' });
      expect(navigation.router.replace).not.toHaveBeenCalled();

      await user.click(within(dialog).getByRole('button', { name: '글 버리고 나가기' }));
      await waitFor(() => expect(navigation.router.replace).toHaveBeenCalledWith('/groups/g1', undefined));
      releaseParent();
      release();
    });
  });

  it('기록 없는 홈이면 앱이 기본 동작(종료)을 하도록 handled false로 답해야 한다', async () => {
    renderProvider();
    await expect(fake.router.requestWeb('navigation.back', {})).resolves.toEqual({ handled: false });
    expect(navigation.router.back).not.toHaveBeenCalled();
    expect(navigation.router.replace).not.toHaveBeenCalled();
  });

  it('딥링크(navigation.open)로 이동하고 앱이 다시 활성화되면 보이는 쿼리를 다시 불러와야 한다', async () => {
    const { client } = renderProvider(
      new ApolloClient({
        cache: new InMemoryCache(),
        link: new MockLink([{ request: { query: MeDocument }, result: { data: { me: null } } }]),
      }),
    );
    const refetchQueries = vi.spyOn(client, 'refetchQueries');

    fake.router.emit('navigation.open', { path: '/invite/abc' });
    await waitFor(() => expect(navigation.router.push).toHaveBeenCalledWith('/invite/abc', undefined));

    fake.router.emit('app.state', { state: 'background' });
    fake.router.emit('app.state', { state: 'active' });
    await waitFor(() => expect(refetchQueries).toHaveBeenCalledOnce());
    expect(refetchQueries).toHaveBeenCalledWith({ include: 'active' });
  });
});
