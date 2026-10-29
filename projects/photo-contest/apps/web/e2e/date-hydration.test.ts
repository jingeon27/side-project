import { seedPost } from './support/photos';
import { expect, seedGroup, test } from './support/test';

test(
  '브라우저가 ko-KR 오전·오후를 영문으로 반환해도 게시물 날짜가 서버 HTML과 일치해야 한다',
  { tag: ['@ios', '@desktop'] },
  async ({ page, signIn }) => {
    const cookie = await signIn('날짜 표시 확인');
    const group = await seedGroup(cookie, '날짜 표시 그룹');
    await seedPost(cookie, group.id, '서버와 같은 날짜');
    await page.addInitScript(() => {
      const formatToParts = Intl.DateTimeFormat.prototype.formatToParts;
      Intl.DateTimeFormat.prototype.formatToParts = function (date) {
        return formatToParts.call(this, date).map((part) => ({
          ...part,
          value: part.value.replace('오전', 'AM').replace('오후', 'PM'),
        }));
      };
    });
    await page.goto(`/groups/${group.id}`);
    const post = page
      .getByRole('region', { name: '최신 게시물', exact: true })
      .getByRole('article', { name: '서버와 같은 날짜', exact: true });
    await expect(post.locator('time')).toHaveText(/\(.*\) (오전|오후) \d{1,2}:\d{2}$/);
    await page.reload();
    await expect(post.locator('time')).toHaveText(/\(.*\) (오전|오후) \d{1,2}:\d{2}$/);
  },
);
