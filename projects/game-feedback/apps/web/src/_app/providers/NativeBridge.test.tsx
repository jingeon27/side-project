import type { ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import { overlay, OverlayProvider } from 'overlay-kit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BRIDGE_EVENT } from '@game-feedback/bridge';

import { nativeBridgeChannel } from '@/shared/native';
import { NavigationGuardProvider, useUnsavedChanges } from '@/shared/navigation';
import { openOverlay, type IOverlayControlProps } from '@/shared/ui';

import { NativeBridge } from './NativeBridge';

const router = vi.hoisted(() => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({
  usePathname: () => '/ko/posts/post-1',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => router,
}));
vi.mock('@/features/auth', () => ({
  refreshSessionMutationOptions: () => ({ mutationFn: async () => undefined }),
}));

const postMessage = vi.fn();
beforeEach(() => {
  Reflect.set(window, '__GAME_FEEDBACK_APP__', { protocol: 1 });
  Reflect.set(window, 'ReactNativeWebView', { postMessage });
  nativeBridgeChannel.start();
});
afterEach(() => {
  act(() => overlay.unmountAll());
  nativeBridgeChannel.stop();
  Reflect.deleteProperty(window, '__GAME_FEEDBACK_APP__');
  Reflect.deleteProperty(window, 'ReactNativeWebView');
  window.history.replaceState(null, '', '/');
  postMessage.mockReset();
  router.replace.mockReset();
});

// 고친 내용이 있는 수정 시트처럼 이탈 확인을 등록하고, 이탈을 승인하면 초안을 버리고 스스로 닫는다.
function DraftSheet({ open, onOpenChange }: IOverlayControlProps) {
  useUnsavedChanges({
    hasChanges: true,
    confirm: () => window.confirm('고친 내용을 버릴까요?'),
    onDiscard: () => onOpenChange(false),
  });
  return open ? <div role="dialog" aria-label="수정 시트" /> : null;
}
function LinkDialog({ open }: IOverlayControlProps) {
  return open ? <div role="dialog" aria-label="링크 넣기" /> : null;
}
function PageDraft() {
  useUnsavedChanges({ hasChanges: true, confirm: () => window.confirm('글쓰기 초안을 버릴까요?') });
  return null;
}

function renderBridge(page?: ReactNode) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <NavigationGuardProvider>
        <OverlayProvider>
          {page}
          <NativeBridge />
        </OverlayProvider>
      </NavigationGuardProvider>
    </QueryClientProvider>,
  );
}
/** 그 back의 back-result와 보낸 순서(order)를 돌려준다. order는 모든 mock이 함께 쓰는 호출 순서라 확인 창과 비교한다. */
function pressBack(id: string) {
  act(() => {
    window.dispatchEvent(new CustomEvent(BRIDGE_EVENT, { detail: { type: 'back', id } }));
  });
  const index = postMessage.mock.calls.findIndex(([data]) => {
    const message = JSON.parse(data);
    return message.type === 'back-result' && message.id === id;
  });
  return {
    ...JSON.parse(postMessage.mock.calls[index]?.[0] ?? '{}'),
    order: postMessage.mock.invocationCallOrder[index],
  };
}

// 앱 back이 열린 오버레이를 바로 닫아, 고친 수정 시트가 확인 없이 사라졌다.
describe('앱 back으로 오버레이 닫기', () => {
  it('고친 수정 시트는 응답을 먼저 보낸 뒤 이탈을 확인하고, 취소하면 시트를 그대로 둔다', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderBridge();
    act(() => {
      openOverlay(DraftSheet);
    });
    await screen.findByRole('dialog', { name: '수정 시트' });
    const answer = pressBack('back-1');
    expect(answer).toMatchObject({ type: 'back-result', id: 'back-1', handled: true });
    expect(confirm).toHaveBeenCalledExactlyOnceWith('고친 내용을 버릴까요?');
    // 네이티브는 back-result를 800ms만 기다린다. 확인 창에 답하는 동안 응답이 늦으면 WebView 기록 이동이나 앱 종료로 넘어간다.
    expect(answer.order).toBeLessThan(Number(confirm.mock.invocationCallOrder[0]));
    expect(screen.getByRole('dialog', { name: '수정 시트' })).toBeTruthy();
    confirm.mockReturnValue(true);
    pressBack('back-2');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '수정 시트' })).toBeNull());
    expect(confirm).toHaveBeenCalledTimes(2);
  });

  it('아래 화면의 초안은 화면을 떠나지 않는 오버레이 닫기에서 묻지 않는다', async () => {
    const confirm = vi.spyOn(window, 'confirm');
    renderBridge(<PageDraft />);
    act(() => {
      openOverlay(LinkDialog);
    });
    await screen.findByRole('dialog', { name: '링크 넣기' });
    pressBack('back-1');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '링크 넣기' })).toBeNull());
    expect(confirm).not.toHaveBeenCalled();
  });

  it('수정 시트 위의 다른 창만 닫을 때는 시트의 초안을 묻지 않는다', async () => {
    const confirm = vi.spyOn(window, 'confirm');
    renderBridge();
    act(() => {
      openOverlay(DraftSheet);
    });
    act(() => {
      openOverlay(LinkDialog);
    });
    await screen.findByRole('dialog', { name: '링크 넣기' });
    pressBack('back-1');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '링크 넣기' })).toBeNull());
    expect(screen.getByRole('dialog', { name: '수정 시트' })).toBeTruthy();
    expect(confirm).not.toHaveBeenCalled();
  });
});

// 이전 기록 없이 연 화면의 back은 상위로 replace하기 전에 이탈을 확인한다. 그 확인이 응답보다 먼저 떠 있었다.
describe('앱 back으로 상위 화면 바꾸기', () => {
  it('딥링크로 연 글쓰기 초안은 응답을 먼저 보낸 뒤 이탈을 확인하고, 승인해야 상위로 바꾼다', () => {
    window.history.replaceState(null, '', '/ko/write');
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderBridge(<PageDraft />);
    const answer = pressBack('back-1');
    expect(answer).toMatchObject({ type: 'back-result', id: 'back-1', handled: true });
    expect(confirm).toHaveBeenCalledExactlyOnceWith('글쓰기 초안을 버릴까요?');
    expect(answer.order).toBeLessThan(Number(confirm.mock.invocationCallOrder[0]));
    expect(router.replace).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    pressBack('back-2');
    expect(router.replace).toHaveBeenCalledExactlyOnceWith('/ko');
  });
});
