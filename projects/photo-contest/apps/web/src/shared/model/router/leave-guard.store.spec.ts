// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { leaveAfterConfirm, registerLeaveGuard } from './leave-guard.store';
import { hasOpenOverlay, pushOverlayEntry, releaseOverlayEntry } from './overlay-history.store';

const WRITE_PATH = '/groups/g1/write';

const releases: Array<() => void> = [];
const guard = (pathname: string, confirmLeave: () => Promise<boolean>) => {
  releases.push(registerLeaveGuard(pathname, confirmLeave));
};

const arriveAt = (pathname: string) =>
  new Promise<void>((resolve) => {
    const handlePopState = () => {
      if (window.location.pathname !== pathname) return;
      window.removeEventListener('popstate', handlePopState);
      resolve();
    };
    window.addEventListener('popstate', handlePopState);
  });

afterEach(() => {
  releases.splice(0).forEach((release) => release());
});

describe('leave guard', () => {
  it('확인을 등록하지 않은 화면은 묻지 않고 바로 떠나야 한다', () => {
    const leave = vi.fn();
    leaveAfterConfirm(WRITE_PATH, leave);
    expect(leave).toHaveBeenCalledOnce();
  });

  it('등록한 화면에서만 묻고, 머물기로 하면 떠나지 않아야 한다', async () => {
    const confirmLeave = vi.fn(async () => false);
    guard(WRITE_PATH, confirmLeave);
    const leave = vi.fn();

    leaveAfterConfirm('/groups/g1', leave);
    expect(leave).toHaveBeenCalledOnce();
    expect(confirmLeave).not.toHaveBeenCalled();

    leaveAfterConfirm(WRITE_PATH, leave);
    await vi.waitFor(() => expect(confirmLeave).toHaveBeenCalledOnce());
    // 이어지는 마이크로태스크가 몇 번이든 다 끝난 뒤에 확인한다.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(leave).toHaveBeenCalledOnce();
  });

  it('해제한 확인은 묻지 않고, 늦게 해제한 이전 등록이 새 등록을 지우지 않아야 한다', async () => {
    const first = vi.fn(async () => false);
    const second = vi.fn(async () => false);
    const releaseFirst = registerLeaveGuard(WRITE_PATH, first);
    guard(WRITE_PATH, second);
    releaseFirst();
    const leave = vi.fn();

    leaveAfterConfirm(WRITE_PATH, leave);
    await vi.waitFor(() => expect(second).toHaveBeenCalledOnce());
    expect(first).not.toHaveBeenCalled();
    releases.splice(0).forEach((release) => release());
    leaveAfterConfirm(WRITE_PATH, leave);
    expect(leave).toHaveBeenCalledOnce();
  });

  it('묻는 대화상자의 history 항목이 늦게 걷혀도 그 뒤에 떠나 이전 화면에 도착해야 한다', async () => {
    window.history.replaceState(null, '', '/groups/g1');
    window.history.pushState(null, '', WRITE_PATH);
    guard(WRITE_PATH, async () => {
      const dialog = pushOverlayEntry(vi.fn());
      // 확인을 누르면 결정은 바로 끝나지만 대화상자 항목은 React가 닫힘을 반영한 뒤에 back()으로 걷힌다.
      setTimeout(() => releaseOverlayEntry(dialog), 30);
      return true;
    });
    const previous = arriveAt('/groups/g1');

    leaveAfterConfirm(WRITE_PATH, () => window.history.back());

    await previous;
    expect(window.location.pathname).toBe('/groups/g1');
    expect(hasOpenOverlay()).toBe(false);
  });
});
