import { Suspense } from 'react';
import { renderToString } from 'react-dom/server';

import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Await } from './Await';

describe('streamed snapshot replacement', () => {
  it('keeps synchronous document content in server HTML', () => {
    expect(renderToString(<Await value="본문">{(value) => <p>{value}</p>}</Await>)).toContain('본문');
  });

  it('can replace a suspended promise with document data without a conditional use warning', async () => {
    const error = vi.spyOn(console, 'error');
    const pending = Promise.withResolvers<string>();
    const view = await act(async () =>
      render(
        <Suspense fallback={<p>불러오는 중</p>}>
          <Await value={pending.promise}>{(value) => <p>{value}</p>}</Await>
        </Suspense>,
      ),
    );
    expect(screen.getByText('불러오는 중')).toBeTruthy();
    view.rerender(
      <Suspense fallback={<p>불러오는 중</p>}>
        <Await value="새 문서">{(value) => <p>{value}</p>}</Await>
      </Suspense>,
    );
    expect(await screen.findByText('새 문서')).toBeTruthy();
    await act(async () => pending.resolve('늦은 응답'));
    expect(screen.getByText('새 문서')).toBeTruthy();
    expect(error).not.toHaveBeenCalled();
  });
});
