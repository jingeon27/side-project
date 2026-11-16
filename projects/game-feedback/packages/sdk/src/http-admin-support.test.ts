import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiResponseValidationError, listAdminSupportMessages } from './index';
import { messagesFixture } from './test/fixtures';

function respond(payload: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify(payload), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    ),
  );
}
afterEach(() => vi.unstubAllGlobals());

const attachment = {
  id: 'attachment-1',
  name: 'evidence.png',
  mimeType: 'image/png',
  size: 12,
  kind: 'IMAGE',
};
function historyWith(url: string) {
  const fixture = messagesFixture();
  return {
    ...fixture,
    items: fixture.items.map((message) => ({ ...message, attachments: [{ ...attachment, url }] })),
  };
}

describe('관리자 문의 기록의 첨부', () => {
  it('관리자 경로로 내려받는 첨부가 있어도 문의 기록을 읽는다', async () => {
    const url = '/api/admin/support/room-1/attachments/attachment-1';
    respond(historyWith(url));
    const history = await listAdminSupportMessages('room-1');
    expect(history.items[0]?.attachments).toEqual([{ ...attachment, url }]);
  });

  it.each(['/api/conversations/room-1/attachments/attachment-1', 'https://untrusted.example/private'])(
    '관리자 쿠키가 실리지 않는 첨부 주소 %s는 받지 않는다',
    async (url) => {
      respond(historyWith(url));
      await expect(listAdminSupportMessages('room-1')).rejects.toBeInstanceOf(ApiResponseValidationError);
    },
  );
});
