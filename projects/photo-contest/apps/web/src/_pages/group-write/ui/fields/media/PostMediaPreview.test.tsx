import { StrictMode } from 'react';

import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PostMediaPreview } from './PostMediaPreview';

const file = new File(['video'], 'clip.mp4', { type: 'video/mp4' });
const props = { file, src: 'blob:first', onReplace: vi.fn(), onRemove: vi.fn() };

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('동영상 노드 정리', () => {
  it('미리보기 실패로 동영상 노드가 제거되면 즉시 재생을 멈춰야 한다', () => {
    render(<PostMediaPreview {...props} />);
    const video = screen.getByLabelText('선택한 동영상 미리보기');
    fireEvent.error(video);
    expect(video).not.toBeInTheDocument();
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalledOnce();
    expect(vi.mocked(HTMLMediaElement.prototype.pause).mock.contexts).toEqual([video]);
  });

  it('주소가 바뀌면 이전 노드를 정리하고 unmount 때 새 노드를 정리해야 한다', () => {
    const { rerender, unmount } = render(<PostMediaPreview {...props} />);
    const previous = screen.getByLabelText('선택한 동영상 미리보기');
    rerender(<PostMediaPreview {...props} src="blob:second" />);
    const current = screen.getByLabelText('선택한 동영상 미리보기');
    expect(current).not.toBe(previous);
    expect(vi.mocked(HTMLMediaElement.prototype.pause).mock.contexts).toEqual([previous]);
    unmount();
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalledTimes(2);
    expect(vi.mocked(HTMLMediaElement.prototype.pause).mock.contexts).toEqual([previous, current]);
  });

  it('StrictMode 재연결 이후 상태·콜백 교체만으로 재생을 멈추지 않아야 한다', () => {
    const { rerender, unmount } = render(
      <StrictMode>
        <PostMediaPreview {...props} />
      </StrictMode>,
    );
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalledOnce();
    fireEvent.loadedData(screen.getByLabelText('선택한 동영상 미리보기'));
    rerender(
      <StrictMode>
        <PostMediaPreview {...props} onReplace={vi.fn()} />
      </StrictMode>,
    );
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalledOnce();
    unmount();
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalledTimes(2);
  });
});
