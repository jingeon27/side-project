import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { RichTextDocumentSchema } from '@game-feedback/contracts';

import { LanguageProvider } from '@/shared/i18n';

import { RichTextBody } from './RichTextBody';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }));

// 본문 사진과 동영상의 대체 텍스트가 한국어로 고정돼 영어·일본어 화면에서도 한국어로 읽혔다.
it('names post media in the selected language', () => {
  const document = RichTextDocumentSchema.parse({
    ops: [
      { insert: { image: '/api/post-media/image-1' } },
      { insert: '\n' },
      { insert: { video: '/api/post-media/video-1' } },
      { insert: '\n' },
    ],
  });
  const { container } = render(
    <LanguageProvider initialLocale="en" initialPreference="en" automaticLocale="en">
      <RichTextBody body="" document={document} />
    </LanguageProvider>,
  );
  expect(screen.getByRole('img', { name: 'Post photo' }).getAttribute('src')).toBe('/api/post-media/image-1');
  expect(container.querySelector('video')?.getAttribute('aria-label')).toBe('Post video');
});
