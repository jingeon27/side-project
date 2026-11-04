// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { usePostSearch } from './use-post-search';

describe('usePostSearch 주소 쓰기', () => {
  afterEach(() => window.history.replaceState(null, '', '/'));

  async function submit(value: string) {
    const { result } = renderHook(() => usePostSearch('old'));
    await act(async () => {
      result.current.form.setValue('q', value);
      await result.current.handleSubmit();
    });
    return result;
  }

  it('검색어만 뒤로 옮겨 바꾸고 다른 키의 순서와 중복을 보존해야 한다', async () => {
    window.history.replaceState(null, '', '/ko/search?q=old&board=free&tag=a&tag=b');
    await submit('  수비 덱  ');
    expect(window.location.pathname).toBe('/ko/search');
    expect(window.location.search).toBe('?board=free&tag=a&tag=b&q=%EC%88%98%EB%B9%84%20%EB%8D%B1');
  });

  it('검색어를 지우면 다른 키가 없을 때 물음표를 남기지 않아야 한다', async () => {
    window.history.replaceState(null, '', '/ko/search?q=old');
    const result = await submit('new');
    expect(window.location.search).toBe('?q=new');
    act(() => result.current.handleClear());
    expect(window.location.search).toBe('');
    expect(`${window.location.pathname}${window.location.search}`).toBe('/ko/search');
  });
});
