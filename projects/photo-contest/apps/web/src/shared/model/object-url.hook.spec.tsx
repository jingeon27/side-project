import { StrictMode } from 'react';

import { render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useObjectUrl } from './object-url.hook';

const urls = vi.hoisted(() => ({ live: new Set<string>(), created: 0 }));

beforeEach(() => {
  urls.live.clear();
  urls.created = 0;
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {
    urls.created += 1;
    const url = `blob:preview-${urls.created}`;
    urls.live.add(url);
    return url;
  });
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation((url) => {
    urls.live.delete(url);
  });
});
afterEach(() => vi.restoreAllMocks());

const photo = (name: string) => new File(['image'], name, { type: 'image/png' });

describe('useObjectUrl', () => {
  it('파일이 있으면 주소를 만들고 파일이 바뀌면 이전 주소를 풀어야 한다', () => {
    const first = photo('first.png');
    const view = renderHook(({ file }) => useObjectUrl(file), {
      initialProps: { file: first as File | null },
    });
    expect(view.result.current).toBe('blob:preview-1');

    view.rerender({ file: first });
    expect(view.result.current).toBe('blob:preview-1');
    expect(urls.created).toBe(1);

    view.rerender({ file: photo('second.png') });
    expect(view.result.current).toBe('blob:preview-2');
    expect([...urls.live]).toEqual(['blob:preview-2']);

    view.rerender({ file: null });
    expect(view.result.current).toBeNull();
    expect(urls.live.size).toBe(0);
  });

  it('화면이 사라지면 만든 주소를 풀어야 한다', () => {
    const view = renderHook(() => useObjectUrl(photo('photo.png')));
    expect(urls.live.size).toBe(1);
    view.unmount();
    expect(urls.live.size).toBe(0);
  });

  it('StrictMode에서 다시 구독해도 살아 있는 주소를 보여줘야 한다', () => {
    const file = photo('photo.png');
    function Preview() {
      const url = useObjectUrl(file);
      return <p>{url}</p>;
    }
    render(
      <StrictMode>
        <Preview />
      </StrictMode>,
    );
    const shown = screen.getByText(/^blob:/).textContent;
    expect(shown && urls.live.has(shown)).toBe(true);
    expect(urls.live.size).toBe(1);
  });
});
