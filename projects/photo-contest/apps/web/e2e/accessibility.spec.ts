import { createRequire } from 'node:module';

import type { Locator, Page } from '@playwright/test';
import type { AxeResults, ImpactValue, RunOptions } from 'axe-core';
import dayjs from 'dayjs';

import { createTestUser, moveTestContest } from '@photo-contest/test-kit';

import { API_URL, WEB_ORIGIN } from './support/env';
import { productRequest, seedContestEntry, seedPost } from './support/photos';
import { expect, seedGroup, test } from './support/test';

const AXE_SOURCE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');

/** WCAG 2.0·2.1·2.2의 A·AA 규칙만 돌린다. 모범 사례와 실험 규칙은 넣지 않는다. */
const AXE_OPTIONS: RunOptions = {
  runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
  resultTypes: ['violations'],
};
const BLOCKING_IMPACTS: ReadonlyArray<ImpactValue> = ['serious', 'critical'];

interface IViolationNode {
  target: string;
  /**
   * target-size 검사가 '일부 가려짐'으로 실패했고, 스크롤에 따라 움직이는 대상(fixed 층 밖)을 덮은 누름 대상이
   * 모두 대상과 다른 fixed·sticky 층(하단 메뉴, 앱바, 떠 있는 버튼) 안에 있다.
   */
  coveredByFixedLayer: boolean;
}

interface IViolation {
  id: string;
  impact: ImpactValue;
  help: string;
  nodes: IViolationNode[];
}

/** 화면 코드와 상관없이 생기는 결과만 규칙과 조건으로 뺀다. 늘릴 때는 이유와 발견 ID를 함께 적는다. */
const ALLOWED_VIOLATIONS: ReadonlyArray<{
  rule: string;
  finding: string;
  reason: string;
  allows: (node: IViolationNode) => boolean;
}> = [
  {
    rule: 'target-size',
    // 2026-11-11 품질 감사 보고서 7.1(기각한 주장)의 '부분적으로 가려짐' target-size 경고 2건
    finding: '감사 7.1 target-size 부분 가림',
    reason:
      '고정된 하단 메뉴·앱바·글쓰기 버튼이 스크롤 위치에 따라 일부를 덮은 경우다. 감사에서도 위치에 따른 결과로 기각했다. 크기 자체가 작거나 본문의 다른 누름 대상과 겹친 경우는 그대로 잡는다.',
    // 부분 가림은 대상 자체가 24px 이상일 때만 나오므로 고정 층이 비켜나면 간격(target-offset)과 상관없이 통과한다.
    allows: (node) => node.coveredByFixedLayer,
  },
];

/**
 * 열리는 전환이 끝난 뒤에 검사해야 반투명한 중간 색으로 대비를 재지 않는다.
 * 도중에 취소되거나 다시 시작된 전환은 finished가 AbortError로 끝나므로 결과와 상관없이 모두 끝나기만 기다린다.
 */
async function waitForTransitions(locator: Locator) {
  await locator.evaluate((element) =>
    Promise.allSettled(
      element
        .getAnimations({ subtree: true })
        .filter((animation) => animation.effect?.getComputedTiming().endTime !== Infinity)
        .map((animation) => animation.finished),
    ),
  );
}

async function expectNoBlockingViolations(page: Page, screen: string) {
  await page.addScriptTag({ path: AXE_SOURCE });
  const violations = await page.evaluate(async (options): Promise<IViolation[]> => {
    const axe = Reflect.get(window, 'axe') as {
      run: (context: Document, runOptions: RunOptions) => Promise<AxeResults>;
    };
    // 자신을 포함해 가장 가까운 fixed·sticky 조상. 고정 층 밖이면 null이다.
    const layerOf = (element: Element | null): Element | null => {
      if (element === null) return null;
      if (['fixed', 'sticky'].includes(getComputedStyle(element).position)) return element;
      return layerOf(element.parentElement);
    };
    const results = await axe.run(document, options);
    return results.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact ?? null,
      help: violation.help,
      nodes: violation.nodes.map((node) => {
        const targetLayer = layerOf(document.querySelector(String(node.target[0])));
        // 스크롤에 따라 움직이는 대상을 다른 고정 층이 덮은 경우만 뺀다. fixed 층 안의 대상은 움직이지 않고,
        // 같은 층 안에서 겹친 대상끼리는 스크롤과 상관없이 늘 겹치므로 실제 위반으로 남긴다.
        const movesWithScroll = targetLayer === null || getComputedStyle(targetLayer).position !== 'fixed';
        return {
          target: node.target.join(' '),
          coveredByFixedLayer:
            movesWithScroll &&
            [...node.any, ...node.all, ...node.none].some(
              (check) =>
                check.id === 'target-size' &&
                String(check.data?.messageKey ?? '').startsWith('partiallyObscured') &&
                Boolean(check.relatedNodes?.length) &&
                (check.relatedNodes ?? []).every((related) => {
                  const layer = layerOf(document.querySelector(String(related.target[0])));
                  return layer !== null && layer !== targetLayer;
                }),
            ),
        };
      }),
    }));
  }, AXE_OPTIONS);
  const blocking = violations
    .filter((violation) => BLOCKING_IMPACTS.includes(violation.impact))
    .map((violation) => ({
      ...violation,
      nodes: violation.nodes.filter(
        (node) =>
          !ALLOWED_VIOLATIONS.some((allowed) => allowed.rule === violation.id && allowed.allows(node)),
      ),
    }))
    .filter((violation) => violation.nodes.length > 0)
    .map(
      (violation) =>
        `${violation.id}(${violation.impact}) ${violation.help}: ${violation.nodes.map((node) => node.target).join(', ')}`,
    );
  expect(blocking, `${screen} 화면의 심각한 WCAG A·AA 위반`).toEqual([]);
}

const COLOR_SCHEMES = [
  { colorScheme: 'light', name: '라이트' },
  { colorScheme: 'dark', name: '다크' },
] as const;

for (const { colorScheme, name } of COLOR_SCHEMES) {
  test(
    `${name} 모드의 홈·댓글 시트·그룹·글쓰기·탐색·MY·알림 화면에 심각한 WCAG A·AA 위반이 없어야 한다`,
    { tag: ['@desktop'] },
    async ({ page, signIn }, testInfo) => {
      await page.emulateMedia({ colorScheme });
      // 닉네임은 24자 이내(API TEXT_LIMIT.NICKNAME)라 'light-desktop-chrome' 앞에는 짧은 접두사만 둔다.
      const suffix = `${colorScheme}-${testInfo.project.name}`;
      const viewer = await signIn(`접근-${suffix}`);
      const friend = await createTestUser(API_URL, { nickname: `친구-${suffix}`, origin: WEB_ORIGIN });
      const group = await seedGroup(viewer, `접근성 그룹-${suffix}`);
      await productRequest(friend, 'mutation($token:String!){joinGroup(token:$token){id}}', {
        token: group.inviteToken,
      });
      const title = '접근성을 확인할 순간';
      const postId = await seedPost(viewer, group.id, title);
      await productRequest(
        friend,
        'mutation($id:ID!){createPostComment(postId:$id,body:"함께 웃은 댓글"){id}}',
        {
          id: postId,
        },
      );

      // 따로 불러오는 영역(최신, 이달의 인기, 올린 게시물)이 모두 그려진 뒤에 검사해야 결과가 매번 같다.
      const popularPost = page
        .getByRole('region', { name: '이달의 인기', exact: true })
        .getByRole('article', { name: title, exact: true });
      await page.goto('/');
      const post = page
        .getByRole('region', { name: '최신 게시물', exact: true })
        .getByRole('article', { name: title, exact: true });
      await expect(post.getByRole('img', { name: title })).toBeVisible();
      await expect(popularPost).toBeVisible();
      await expectNoBlockingViolations(page, '홈');

      await post.getByRole('button', { name: `${title} 댓글 1개`, exact: true }).click();
      const comments = page.getByRole('dialog', { name: '댓글', exact: true });
      await expect(comments.getByText('함께 웃은 댓글', { exact: true })).toBeVisible();
      await waitForTransitions(comments);
      await expectNoBlockingViolations(page, '댓글 시트');
      await page.keyboard.press('Escape');
      await expect(comments).toHaveCount(0);

      await page.goto(`/groups/${group.id}`);
      await expect(
        page
          .getByRole('region', { name: '최신 게시물', exact: true })
          .getByRole('article', { name: title, exact: true }),
      ).toBeVisible();
      await expect(popularPost).toBeVisible();
      await expectNoBlockingViolations(page, '그룹');

      await page.goto(`/groups/${group.id}/write`);
      const form = page.getByRole('form', { name: '그룹에 글쓰기', exact: true });
      await expect(form.getByRole('button', { name: '게시물 올리기', exact: true })).toBeEnabled();
      await expectNoBlockingViolations(page, '글쓰기');

      await page.goto('/explore');
      await expect(page.getByRole('heading', { name: '그룹 탐색', exact: true })).toBeVisible();
      await expect(
        page.getByRole('region', { name: '탐색할 그룹' }).getByRole('article').first(),
      ).toBeVisible();
      await expectNoBlockingViolations(page, '탐색');

      await page.goto('/me');
      await expect(page.getByRole('heading', { name: '마이페이지', exact: true })).toBeVisible();
      await expect(
        page
          .getByRole('region', { name: '참여 그룹', exact: true })
          .getByRole('link', { name: /접근성 그룹/ }),
      ).toBeVisible();
      await expect(
        page
          .getByRole('region', { name: '올린 게시물', exact: true })
          .getByRole('article', { name: title, exact: true }),
      ).toBeVisible();
      await expectNoBlockingViolations(page, 'MY');

      await page.goto('/notifications');
      await expect(
        page.getByRole('list', { name: '활동 알림', exact: true }).getByText('내 게시물에 댓글이 달렸어요'),
      ).toBeVisible();
      await expectNoBlockingViolations(page, '알림');
    },
  );

  test(
    `${name} 모드의 그룹 대회 투표와 결과 화면에 심각한 WCAG A·AA 위반이 없어야 한다`,
    { tag: ['@desktop'] },
    async ({ page, context, signIn }, testInfo) => {
      await page.emulateMedia({ colorScheme });
      const suffix = `${colorScheme}-${testInfo.project.name}`;
      const owner = await signIn(`대회장-${suffix}`);
      const group = await seedGroup(owner, `대회 접근성 그룹-${suffix}`);
      const { createGroupContest: contest } = await productRequest<{ createGroupContest: { id: string } }>(
        owner,
        'mutation($groupId:ID!,$startsAt:DateTime!,$submissionEndsAt:DateTime!,$endsAt:DateTime!){createGroupContest(groupId:$groupId,title:"접근성 웃음 대회",startsAt:$startsAt,submissionEndsAt:$submissionEndsAt,endsAt:$endsAt){id}}',
        {
          groupId: group.id,
          startsAt: dayjs().toISOString(),
          submissionEndsAt: dayjs().add(1, 'hour').toISOString(),
          endsAt: dayjs().add(2, 'hour').toISOString(),
        },
      );
      const join = 'mutation($groupId:ID!){requestGroupMembership(groupId:$groupId){id}}';
      const entrant = await createTestUser(API_URL, {
        nickname: `참가-${suffix}`,
        origin: WEB_ORIGIN,
      });
      const voter = await createTestUser(API_URL, { nickname: `투표-${suffix}`, origin: WEB_ORIGIN });
      await productRequest(entrant, join, { groupId: group.id });
      await productRequest(voter, join, { groupId: group.id });
      await seedContestEntry(owner, { groupId: group.id, contestId: contest.id, title: '그룹장의 참여작' });
      await seedContestEntry(entrant, { groupId: group.id, contestId: contest.id, title: '참가자의 참여작' });
      await moveTestContest(API_URL, { origin: WEB_ORIGIN, contestId: contest.id, phase: 'VOTING' });
      await context.clearCookies();
      await context.addCookies([
        {
          name: 'contest_session',
          value: voter.slice('contest_session='.length),
          url: WEB_ORIGIN,
          httpOnly: true,
          sameSite: 'Lax',
        },
      ]);

      const contestPath = `/groups/${group.id}/contests/${contest.id}`;
      await page.goto(contestPath);
      const vote = page.getByRole('button', { name: '이 참여작에 투표하기 (참가자의 참여작)', exact: true });
      await expect(vote).toBeEnabled();
      await expectNoBlockingViolations(page, '대회 투표');

      await vote.click();
      await expect(
        page.getByRole('button', { name: '내가 투표한 참여작 (참가자의 참여작)', exact: true }),
      ).toBeDisabled();
      await expect(
        page.getByRole('button', { name: '투표 완료 (그룹장의 참여작)', exact: true }),
      ).toBeDisabled();
      await expectNoBlockingViolations(page, '투표한 뒤의 대회');

      await moveTestContest(API_URL, { origin: WEB_ORIGIN, contestId: contest.id, phase: 'COMPLETED' });
      await page.reload();
      const results = page.getByRole('region', { name: '대회 최종 결과' });
      await expect(results.getByText('1위', { exact: true })).toBeVisible();
      await expectNoBlockingViolations(page, '대회 결과');
    },
  );
}
