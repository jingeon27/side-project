import { createElement } from 'react';
import { createPortal } from 'react-dom';
import { renderToString } from 'react-dom/server';

import { describe, expect, it } from 'vitest';

import { OverlayPortal } from './OverlayPortal';

describe('OverlayPortal SSR', () => {
  it('DOM이 없는 서버에서는 Portal만 건너뛰고 주변 콘텐츠를 렌더해야 한다', () => {
    const html = renderToString(
      createElement(
        'section',
        null,
        createElement('button', { type: 'button' }, '메뉴 열기'),
        // eslint-disable-next-line react/no-children-prop -- render prop은 ReactNode 자식 인자로 전달할 수 없다.
        createElement(OverlayPortal, {
          children: (container) =>
            createPortal(createElement('p', null, 'Portal 내용'), container ?? document.body),
        }),
      ),
    );

    expect(html).toContain('메뉴 열기');
    expect(html).not.toContain('Portal 내용');
  });
});
