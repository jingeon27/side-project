import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ChatMessageBody } from './ChatMessageBody';

describe('chat message links', () => {
  it('links web addresses without changing whitespace, punctuation, or query parameters', () => {
    const body =
      '함께 봐요 (https://example.com/replay_(1)?a=1&b=2#round).\n  http://example.org/다시보기\nwww.example.com';
    const { container } = render(<ChatMessageBody body={body} />);

    expect(container.textContent).toBe(body);
    const links = screen.getAllByRole('link');
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      'https://example.com/replay_(1)?a=1&b=2#round',
      'http://example.org/다시보기',
      'https://www.example.com',
    ]);
    links.forEach((link) => {
      expect(link.getAttribute('target')).toBe('_blank');
      expect(link.getAttribute('rel')?.split(' ')).toEqual(
        expect.arrayContaining(['noopener', 'noreferrer', 'ugc']),
      );
    });
  });

  it('keeps unsupported protocols, email addresses, and user markup as plain text', () => {
    const body =
      'javascript:alert(1) data:text/html,<script>alert(1)</script> file:///etc/passwd ftp://files.example.com support@example.com <img src=x onerror=alert(1)>';
    const { container } = render(<ChatMessageBody body={body} />);

    expect(container.textContent).toBe(body);
    expect(screen.queryByRole('link')).toBeNull();
    expect(container.querySelector('script, img')).toBeNull();
  });

  it('preserves the full destination and label of a long replay link', () => {
    const url = `https://example.com/replay?token=${'a'.repeat(500)}`;
    render(<ChatMessageBody body={url} />);

    const link = screen.getByRole('link', { name: url });
    expect(link.getAttribute('href')).toBe(url);
  });
});
