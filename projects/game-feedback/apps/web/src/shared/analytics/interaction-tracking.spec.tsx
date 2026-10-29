import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { installBrowserNavigation } from '@/shared/navigation';

import { installInteractionTracking, interactionProperties } from './interaction-tracking';

const disposals: Array<() => void> = [];
beforeEach(() => window.history.replaceState(null, '', '/ko'));
afterEach(() => {
  disposals
    .splice(0)
    .reverse()
    .forEach((dispose) => dispose());
  document.body.replaceChildren();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('사용자 인터랙션 분석', () => {
  it('공통 컨트롤 클릭을 위치와 영역으로 구분하고 원문·검색어·개인 ID를 보내지 않아야 한다', () => {
    document.body.innerHTML =
      '<header class="topbar"><a href="/ko/search?q=private-secret">검색</a></header><main><a href="/ko/posts/private-post">사용자가 작성한 비공개 제목</a></main>';
    const send = vi.fn();
    disposals.push(installInteractionTracking(send));
    document.querySelector('header a')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    document.querySelector('main a')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(send).toHaveBeenNthCalledWith(1, 'ui_interaction', {
      interaction: 'click',
      surface: 'header',
      control: 'a',
      action: 'search',
      position: 0,
      destination_screen: 'search',
    });
    expect(send).toHaveBeenNthCalledWith(
      2,
      'ui_interaction',
      expect.objectContaining({
        surface: 'content',
        action: 'a',
        destination_screen: 'post',
      }),
    );
    expect(JSON.stringify(send.mock.calls)).not.toMatch(/private|비공개 제목/);
  });

  it('선택 인덱스·체크 상태만 기록하고 비밀번호와 입력한 문장은 기록하지 않아야 한다', () => {
    const select = document.createElement('select');
    select.innerHTML = '<option>첫 선택</option><option selected>비공개 값</option>';
    expect(interactionProperties(select, 'change').selected_index).toBe(1);
    const password = document.createElement('input');
    password.type = 'password';
    password.value = 'private-password';
    expect(interactionProperties(password, 'input')).not.toHaveProperty('has_text');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = true;
    expect(interactionProperties(checkbox, 'change').checked).toBe(true);
  });

  it('입력을 모아서 기록하고 추적을 해제하면 예약된 입력도 전송하지 않아야 한다', () => {
    vi.useFakeTimers();
    const send = vi.fn();
    document.body.innerHTML = '<main><input type="search" value="private-query"></main>';
    const dispose = installInteractionTracking(send);
    const input = document.querySelector('input');
    for (const value of ['비', '비공', '비공개']) {
      if (!input) throw new Error('검색 입력이 필요합니다.');
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    vi.advanceTimersByTime(600);
    expect(send).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith(
      'ui_interaction',
      expect.objectContaining({ interaction: 'input', has_text: true }),
    );
    input?.dispatchEvent(new Event('input', { bubbles: true }));
    dispose();
    vi.advanceTimersByTime(600);
    expect(send).toHaveBeenCalledOnce();
    expect(JSON.stringify(send.mock.calls)).not.toMatch(/비공개|private/);
  });

  it('화면 전환 전의 체류를 해당 화면으로 기록하고 페이지 스크롤 단계는 한 번씩만 기록해야 한다', async () => {
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((frame) => {
      frames.push(frame);
      return frames.length;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
    vi.spyOn(document.documentElement, 'scrollHeight', 'get').mockReturnValue(2000);
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(1000);
    vi.spyOn(window, 'scrollY', 'get').mockReturnValue(800);
    const send = vi.fn();
    disposals.push(installBrowserNavigation(), installInteractionTracking(send));
    for (const _step of [1, 2]) {
      window.dispatchEvent(new Event('scroll'));
      frames.shift()?.(0);
    }
    expect(
      send.mock.calls.filter(([name]) => name === 'scroll_depth').map(([, props]) => props.percent),
    ).toEqual([25, 50, 75]);
    window.history.pushState(null, '', '/ko/settings');
    await Promise.resolve();
    expect(send).toHaveBeenCalledWith(
      'page_engagement',
      expect.objectContaining({ engaged_screen: 'feed', max_scroll_percent: 80 }),
    );
    window.dispatchEvent(new Event('scroll'));
    frames.shift()?.(0);
    expect(send.mock.calls.filter(([name]) => name === 'scroll_depth')).toHaveLength(6);
  });
});
