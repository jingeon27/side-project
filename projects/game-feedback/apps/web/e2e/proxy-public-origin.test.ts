import { expect, test } from './support/test';

test('root redirects use the external HTTPS origin behind a reverse proxy', async ({ request }) => {
  const response = await request.get('/?q=deck&tab=latest', {
    headers: {
      Host: 'game.bambyul.com',
      'X-Forwarded-Proto': 'https',
      'Accept-Language': 'ko-KR',
    },
    maxRedirects: 0,
  });

  expect(response.status()).toBe(307);
  expect(response.headers().location).toBe('https://game.bambyul.com/ko?q=deck&tab=latest');
});
