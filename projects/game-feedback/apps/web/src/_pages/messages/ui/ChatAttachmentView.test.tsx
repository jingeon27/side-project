import { fireEvent, render, screen } from '@testing-library/react';
import { overlay, OverlayProvider } from 'overlay-kit';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { TChatAttachment } from '@/shared/api';
import { LanguageProvider } from '@/shared/i18n';

import { ChatAttachmentView } from './ChatAttachmentView';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }));

afterEach(() => overlay.unmountAll());

// 파일 이름이 우연히 번역 사전의 키(닫기 → Close)와 같아도 사용자가 올린 이름을 그대로 보여야 한다.
const attachment = {
  id: 'attachment-1',
  name: '닫기',
  mimeType: 'image/png',
  size: 1024,
  kind: 'IMAGE',
  url: '/api/conversations/conversation-1/attachments/attachment-1',
} satisfies TChatAttachment;

describe('chat attachment viewer', () => {
  it('shows the uploaded file name as the viewer title without passing it through the dictionary', async () => {
    render(
      <LanguageProvider initialLocale="en" initialPreference="en" automaticLocale="en">
        <OverlayProvider>
          <ChatAttachmentView attachment={attachment} />
        </OverlayProvider>
      </LanguageProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'View image: 닫기' }));
    expect(await screen.findByRole('dialog', { name: '닫기' })).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: 'Close' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy();
  });
});
