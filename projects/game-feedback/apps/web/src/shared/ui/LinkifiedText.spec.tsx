import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { LinkifiedText } from './LinkifiedText';

afterEach(cleanup);

describe('자기소개와 메시지의 텍스트 링크', () => {
  it('HTTP(S) 주소와 도메인을 안전한 새 탭 링크로 표시한다', () => {
    render(<LinkifiedText text={'소개 https://royaleapi.com/player/QLLLPR89G\nwww.example.com'} />);
    const link = screen.getByRole('link', { name: 'https://royaleapi.com/player/QLLLPR89G' });
    expect(link.getAttribute('href')).toBe('https://royaleapi.com/player/QLLLPR89G');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(screen.getByRole('link', { name: 'www.example.com' }).getAttribute('href')).toBe(
      'https://www.example.com',
    );
  });

  it('스크립트와 계정정보 URL·이메일은 링크로 만들지 않고 HTML은 그대로 문자로 표시한다', () => {
    const text =
      '<script>alert(1)</script> javascript:alert(1) https://user:password@example.com hello@example.com';
    const { container } = render(<LinkifiedText text={text} />);
    expect(screen.queryByRole('link')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
    expect(container.textContent).toBe(text);
  });
});
