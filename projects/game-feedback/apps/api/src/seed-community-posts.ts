import dayjs from 'dayjs';

import type { Prisma, PrismaClient } from './generated/prisma';

const communityPosts = [
  {
    id: 'sample-friend-sale-0',
    author: 3,
    board: 'FRIEND_SALE',
    title: '친구 추가 30일 이용하실 분 구해요',
    body: '친구 추가 한 자리를 30일 동안 이용하실 분을 구합니다. 친선전과 리플레이 공유가 가능해요. 시작일과 진행 방식은 채팅으로 먼저 이야기해주세요.',
    friendSale: { price: 15000 },
  },
  {
    id: 'sample-friend-sale-1',
    author: 4,
    board: 'FRIEND_SALE',
    title: '친구 추가 장기 이용 문의 받아요',
    body: '친구 추가 장기 이용을 원하는 분과 일정과 금액을 협의합니다. 원하는 기간을 채팅으로 알려주세요.',
    friendSale: { price: null },
  },
  {
    id: 'sample-friendly-0',
    author: 1,
    board: 'FRIENDLY',
    title: '오늘 저녁 9시 친선전 연습하실 분',
    body: '승패 부담 없이 한 시간 정도 친선전 연습하실 분을 찾습니다. 경기 후 서로 좋았던 플레이와 아쉬웠던 점을 짚어봐요. 참여 가능한 시간을 채팅으로 알려주세요.',
  },
  {
    id: 'sample-friendly-1',
    author: 2,
    board: 'FRIENDLY',
    title: '주말에 2대2 함께할 친구 구해요',
    body: '주말 오후에 편하게 2대2 플레이할 친구를 구합니다. 점수나 실력 제한 없이 같이 연습해요. 관심 있으면 댓글이나 채팅 남겨주세요.',
  },
  {
    id: 'sample-battle-duel',
    author: 1,
    board: 'FRIENDLY',
    title: '오늘 저녁 1:1 대전하실 분 구해요',
    body: '한 시간 정도 1:1로 함께 연습할 상대를 찾습니다. 가능한 시간과 게임 계정을 채팅으로 알려주세요.',
    battle: { mode: 'DUEL' },
  },
  {
    id: 'sample-battle-team',
    author: 2,
    board: 'FRIENDLY',
    title: '주말에 함께 전투할 팀원 모집합니다',
    body: '주말 오후에 팀전을 함께할 분을 구합니다. 점수 제한 없이 편하게 플레이해요. 가능한 시간은 채팅으로 이야기해주세요.',
    battle: { mode: 'TEAM' },
  },
  {
    id: 'sample-coaching-hourly',
    author: 3,
    board: 'COACHING',
    title: '수비 배치와 운영을 함께 연습할 수강생 모집',
    body: '리플레이를 함께 보며 수비 배치와 엘릭서 운영을 연습합니다. 1회 60분 수업이고 수업 전 현재 점수와 어려운 매치업을 채팅으로 알려주세요.',
    coaching: { role: 'COACH', pricing: { type: 'HOURLY', amount: 25000 } },
  },
  {
    id: 'sample-coaching-monthly',
    author: 4,
    board: 'COACHING',
    title: '4주 동안 주 2회 운영 코칭 진행합니다',
    body: '한 달 동안 주 2회 리플레이 분석과 실전 연습을 진행합니다. 수업 사이에는 연습 과제를 드리고 다음 시간에 함께 확인해요. 일정은 상담 후 정합니다.',
    coaching: { role: 'COACH', pricing: { type: 'MONTHLY', amount: 180000 } },
  },
  {
    id: 'sample-coaching-goal',
    author: 3,
    board: 'COACHING',
    title: '9000점 달성까지 함께할 코칭 수강생 모집',
    body: '현재 플레이를 먼저 확인한 뒤 목표 달성까지 연습 계획을 세웁니다. 목표와 총수강료, 수업 범위는 상담에서 확인해주세요.',
    coaching: { role: 'COACH', pricing: { type: 'GOAL', amount: 250000, targetScore: '트로피 9000점' } },
  },
  {
    id: 'sample-coaching-student',
    author: 0,
    board: 'COACHING',
    title: '한 달 동안 기본 운영을 알려주실 코치 구해요',
    body: '복귀한 지 얼마 되지 않아 기본 운영부터 다시 배우고 싶어요. 평일 저녁에 수업이 가능하고 월 예산은 12만 원 정도입니다. 가능한 일정과 수업 방식을 알려주세요.',
    coaching: { role: 'STUDENT', pricing: { type: 'MONTHLY', amount: 120000 } },
  },
  {
    id: 'sample-free-0',
    author: 5,
    board: 'FREE',
    title: '오늘 처음으로 목표 점수에 도착했어요',
    body: '지난주부터 공격을 서두르지 않고 수비 후에 움직이는 연습을 했는데 드디어 목표 점수에 도착했어요. 다음에는 친선전으로 다른 운영도 연습해보려고 합니다.',
  },
  {
    id: 'sample-free-1',
    author: 1,
    board: 'FREE',
    title: '복귀 후 느낀 점과 같이 플레이할 친구 이야기',
    body: '오랜만에 돌아오니 달라진 점이 많네요. 혼자 순위를 올리는 것도 좋지만 같이 친선전하고 리플레이 이야기할 사람이 있으면 더 재미있을 것 같아요.',
  },
] satisfies Array<{
  id: string;
  author: number;
  board: string;
  title: string;
  body: string;
  friendSale?: Prisma.InputJsonValue;
  battle?: Prisma.InputJsonValue;
  coaching?: Prisma.InputJsonValue;
}>;

export async function seedCommunityPosts(db: PrismaClient, categoryId: string, authorIds: string[]) {
  for (const [index, entry] of communityPosts.entries()) {
    const { author, ...post } = entry;
    const authorId = authorIds[author];
    if (!authorId) throw new Error(`Community fixture ${post.id} needs sample author ${author}.`);
    await db.post.upsert({
      where: { id: post.id },
      update: {},
      create: {
        ...post,
        categoryId,
        authorId,
        createdAt: dayjs()
          .subtract((index + 1) * 45 * 60 * 1000, 'millisecond')
          .toDate(),
      },
    });
  }
}
