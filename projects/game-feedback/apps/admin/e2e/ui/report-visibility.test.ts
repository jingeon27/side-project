import { expect, test } from '@playwright/test';

import { AdminReportSchema, SessionSchema } from '@game-feedback/contracts';

const timestamp = '2026-11-11T00:00:00.000Z';
const session = SessionSchema.parse({
  user: {
    id: 'browser-admin',
    nickname: '운영자',
    role: 'ADMIN',
    isVerified: false,
    supercellTag: null,
    isTestAccount: false,
    createdAt: timestamp,
    verifiedAt: null,
  },
  demoMode: false,
  googleConfigured: false,
  needsOnboarding: false,
});
// 숨김 사유 상한(500자)보다 긴 신고 내용도 그대로 받는다.
const report = AdminReportSchema.parse({
  id: 'browser-report',
  reporterId: 'browser-reporter',
  targetType: 'POST',
  targetId: 'browser-post',
  targetPostId: 'browser-post',
  targetPreview: '신고된 글',
  targetUserId: 'browser-author',
  reason: 'SPAM',
  detail: '신고 내용'.repeat(200),
  status: 'OPEN',
  createdAt: timestamp,
});

test('콘텐츠 숨김과 해제는 신고 내용 대신 관리자가 입력한 사유를 고른 버튼으로만 보내야 한다', async ({
  page,
}) => {
  const changes: unknown[] = [];
  const unexpected: string[] = [];
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === '/api/admin/auth/session') return route.fulfill({ json: session });
      if (url.pathname === '/api/admin/reports')
        return route.fulfill({ json: { items: [report], nextCursor: null } });
      if (url.pathname === '/api/admin/hide') {
        changes.push(route.request().postDataJSON());
        return route.fulfill({ json: { ok: true } });
      }
      unexpected.push(url.pathname);
      return route.abort();
    },
  );
  await page.goto('/#reports');
  const card = page.locator(`[data-report-id="${report.id}"]`);
  const reason = card.getByRole('textbox', { name: '숨김 사유', exact: true });
  await expect(reason).toHaveAttribute('maxlength', '500');
  await card.getByRole('button', { name: '콘텐츠 숨김', exact: true }).click();
  await expect(card.getByRole('alert')).toHaveText('사유를 입력해주세요.');

  await reason.fill('광고 링크를 확인했습니다');
  await card.getByRole('button', { name: '콘텐츠 숨김', exact: true }).click();
  await expect(reason).toHaveValue('');
  await reason.fill('오신고로 확인했습니다');
  // 해제 사유를 쓰다 Enter를 눌러도 숨김으로 기록되지 않는다.
  await reason.press('Enter');
  await card.getByRole('button', { name: '숨김 해제', exact: true }).click();
  await expect(reason).toHaveValue('');

  expect(changes).toEqual([
    { targetType: 'POST', targetId: report.targetId, hidden: true, reason: '광고 링크를 확인했습니다' },
    { targetType: 'POST', targetId: report.targetId, hidden: false, reason: '오신고로 확인했습니다' },
  ]);
  expect(unexpected).toEqual([]);
});
