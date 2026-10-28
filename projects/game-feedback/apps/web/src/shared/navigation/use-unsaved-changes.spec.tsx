import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { installBrowserNavigation } from './browser-navigation';
import { confirmNavigation } from './navigation-guard';
import { NavigationGuardProvider, useNavigationGuardRegistry } from './NavigationGuardProvider';
import { useUnsavedChanges } from './use-unsaved-changes';

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
});

function start() {
  window.history.replaceState(null, '', '/ko/users/me');
  cleanups.push(installBrowserNavigation());
  window.history.pushState({ tree: 'profile-edit' }, '', '/ko/settings/profile');
}

describe('저장하지 않은 변경의 이탈 확인', () => {
  it('변경 여부가 같아도 새로 전달한 확인 함수를 사용해야 한다', () => {
    const reject = vi.fn(() => false);
    const approve = vi.fn(() => true);
    const hook = renderHook(({ confirm }) => useUnsavedChanges({ hasChanges: true, confirm }), {
      initialProps: { confirm: reject },
      wrapper: NavigationGuardProvider,
    });
    expect(confirmNavigation()).toBe(false);
    hook.rerender({ confirm: approve });
    expect(confirmNavigation()).toBe(true);
    expect(reject).toHaveBeenCalledOnce();
    expect(approve).toHaveBeenCalledOnce();
  });

  it('Provider를 해제하면 이전 등록이 다음 Provider에 남지 않아야 한다', () => {
    const confirm = vi.fn(() => false);
    const previous = renderHook(useNavigationGuardRegistry, { wrapper: NavigationGuardProvider });
    previous.result.current.register({ confirm });
    expect(confirmNavigation()).toBe(false);
    previous.unmount();
    renderHook(useNavigationGuardRegistry, { wrapper: NavigationGuardProvider });
    expect(confirmNavigation()).toBe(true);
    expect(confirm).toHaveBeenCalledOnce();
  });

  it('모든 이탈 확인을 승인했을 때만 초안을 버려야 한다', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(true).mockReturnValueOnce(false);
    const discardProfile = vi.fn();
    const discardLinks = vi.fn();
    renderHook(
      () =>
        useUnsavedChanges({
          hasChanges: true,
          confirm: () => window.confirm('프로필 초안을 버릴까요?'),
          onDiscard: discardProfile,
        }),
      { wrapper: NavigationGuardProvider },
    );
    renderHook(
      () =>
        useUnsavedChanges({
          hasChanges: true,
          confirm: () => window.confirm('링크 초안을 버릴까요?'),
          onDiscard: discardLinks,
        }),
      { wrapper: NavigationGuardProvider },
    );
    expect(confirmNavigation()).toBe(false);
    expect(discardProfile).not.toHaveBeenCalled();
    expect(discardLinks).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    expect(confirmNavigation()).toBe(true);
    expect(discardProfile).toHaveBeenCalledOnce();
    expect(discardLinks).toHaveBeenCalledOnce();
  });

  it('변경이 있을 때만 이동·문서 닫기를 확인하고 저장하거나 언마운트하면 해제해야 한다', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const hook = renderHook(
      ({ dirty }) =>
        useUnsavedChanges({ hasChanges: dirty, confirm: () => window.confirm('초안을 버릴까요?') }),
      {
        initialProps: { dirty: false },
        wrapper: NavigationGuardProvider,
      },
    );
    expect(confirmNavigation()).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
    hook.rerender({ dirty: true });
    expect(confirmNavigation()).toBe(false);
    expect(confirm).toHaveBeenCalledWith('초안을 버릴까요?');
    const unload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);
    hook.rerender({ dirty: false });
    expect(confirmNavigation()).toBe(true);
    const savedUnload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(savedUnload);
    expect(savedUnload.defaultPrevented).toBe(false);
    hook.rerender({ dirty: true });
    hook.unmount();
    expect(confirmNavigation()).toBe(true);
  });

  it('같은 탭의 링크를 취소하면 라우터에 전달하지 않고 새 탭·다운로드는 방해하지 않아야 한다', () => {
    start();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderHook(
      () => useUnsavedChanges({ hasChanges: true, confirm: () => window.confirm('초안을 버릴까요?') }),
      { wrapper: NavigationGuardProvider },
    );
    const link = document.createElement('a');
    link.href = '/ko/messages';
    const navigate = vi.fn((event: MouseEvent) => event.preventDefault());
    link.addEventListener('click', navigate);
    document.body.append(link);
    cleanups.push(() => link.remove());
    link.click();
    expect(navigate).not.toHaveBeenCalled();
    expect(confirm).toHaveBeenCalledOnce();
    confirm.mockClear();
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true }));
    link.target = '_blank';
    link.click();
    link.target = '';
    link.download = 'file';
    link.click();
    expect(navigate).toHaveBeenCalledTimes(3);
    expect(confirm).not.toHaveBeenCalled();
    link.removeAttribute('download');
    confirm.mockReturnValue(true);
    link.click();
    expect(navigate).toHaveBeenCalledTimes(4);
    expect(confirm).toHaveBeenCalledOnce();
  });

  it('브라우저 뒤로 가기를 취소하면 URL·기록·화면을 복구하고 확인하면 한 번만 이동해야 한다', async () => {
    start();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderHook(
      () => useUnsavedChanges({ hasChanges: true, confirm: () => window.confirm('초안을 버릴까요?') }),
      { wrapper: NavigationGuardProvider },
    );
    const nextRouter = vi.fn();
    window.addEventListener('popstate', nextRouter);
    cleanups.push(() => window.removeEventListener('popstate', nextRouter));
    const length = window.history.length;
    window.history.back();
    await waitFor(() => expect(confirm).toHaveBeenCalledOnce());
    await waitFor(() => expect(window.location.pathname).toBe('/ko/settings/profile'));
    expect(window.history.state.tree).toBe('profile-edit');
    expect(window.history.length).toBe(length);
    expect(nextRouter).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    window.history.back();
    await waitFor(() => expect(window.location.pathname).toBe('/ko/users/me'));
    expect(nextRouter).toHaveBeenCalledOnce();
    expect(confirm).toHaveBeenCalledTimes(2);
  });

  it('여러 항목을 건너뛴 뒤로 가기를 취소해도 현재 기록으로 복구해야 한다', async () => {
    start();
    window.history.pushState({}, '', '/ko/settings');
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderHook(
      () => useUnsavedChanges({ hasChanges: true, confirm: () => window.confirm('초안을 버릴까요?') }),
      { wrapper: NavigationGuardProvider },
    );
    window.history.go(-2);
    await waitFor(() => expect(confirm).toHaveBeenCalledOnce());
    await waitFor(() => expect(window.location.pathname).toBe('/ko/settings'));
  });

  it('다른 URL이 같은 기록 번호를 갖더라도 취소한 뒤로 가기를 복구해야 한다', async () => {
    start();
    window.history.replaceState(
      { __game_feedback_navigation: { index: 0, previous: '/ko/users/me' } },
      '',
      '/ko/settings/profile',
    );
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderHook(
      () => useUnsavedChanges({ hasChanges: true, confirm: () => window.confirm('초안을 버릴까요?') }),
      { wrapper: NavigationGuardProvider },
    );
    window.history.back();
    await waitFor(() => expect(confirm).toHaveBeenCalledOnce());
    await waitFor(() => expect(window.location.pathname).toBe('/ko/settings/profile'));
  });

  it('기록 추적을 설치하기 전의 화면으로 돌아갈 때도 초안을 확인해야 한다', async () => {
    window.history.replaceState({ __NA: true }, '', '/ko/users/me');
    window.history.pushState({ __NA: true }, '', '/ko/settings/profile');
    cleanups.push(installBrowserNavigation());
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderHook(
      () => useUnsavedChanges({ hasChanges: true, confirm: () => window.confirm('초안을 버릴까요?') }),
      { wrapper: NavigationGuardProvider },
    );
    window.history.back();
    await waitFor(() => expect(confirm).toHaveBeenCalledOnce());
    await waitFor(() => expect(window.location.pathname).toBe('/ko/settings/profile'));
  });
});
