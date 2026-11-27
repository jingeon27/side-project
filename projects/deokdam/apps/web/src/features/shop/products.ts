import { z } from 'zod';

import type { TElement } from '@/features/reading/contracts';
import { elementDescriptions } from '@/features/reading/interpretation';

export const productSchema = z.enum(['job-week', 'parent-week']);
export type TProduct = z.infer<typeof productSchema>;

interface IProduct {
  title: string;
  topic: 'job' | 'parent';
  cards: readonly { title: string; practice: string }[];
}

export const reportPrice = 4900;
export const products = {
  'job-week': {
    title: '다음 한 곳에 지원하기까지 7일',
    topic: 'job',
    cards: [
      {
        title: '이미 해낸 일 한 문장',
        practice: '내가 최근에 도운 사람을 떠올리고 그때 한 일을 한 줄로 적어요.',
      },
      {
        title: '동료의 눈으로 읽기',
        practice: '친구와 자기소개서 첫 줄을 나누고 더 듣고 싶은 부분을 하나씩 말해요.',
      },
      {
        title: '지원하고 싶은 한 곳',
        practice: '공고를 한 개 고르고 회사가 찾는 행동 세 가지에 밑줄을 그어요.',
      },
      {
        title: '공고와 내 경험 연결하기',
        practice: '밑줄 친 행동 한 가지를 고르고 그와 비슷하게 움직였던 장면을 적어요.',
      },
      {
        title: '숫자 하나, 장면 하나',
        practice: '몇 명과 일했는지, 내가 맡은 범위가 무엇이었는지 기억나는 사실을 넣어요.',
      },
      {
        title: '첫 20초 연습',
        practice: '내가 쓴 한 문장을 소리 내어 읽고 어려운 단어 하나를 쉬운 말로 바꿔요.',
      },
      {
        title: '보내기 전 마지막 점검',
        practice: '파일 이름, 마감 시각, 연락처를 확인하고 보낸 것은 기록해 둬요.',
      },
    ],
  },
  'parent-week': {
    title: '결과를 기다리는 부모의 7일',
    topic: 'parent',
    cards: [
      { title: '같이 먹고 싶은 저녁', practice: '아이가 바로 답할 수 있는 저녁 메뉴 하나를 먼저 물어봐요.' },
      { title: '내 마음 한 문장', practice: '지금 가장 조바심이 나는 이유를 나에게만 보이는 곳에 써요.' },
      { title: '조언하기 전에 묻기', practice: '듣기만 할까, 같이 방법을 찾아볼까? 하고 선택권을 건네요.' },
      {
        title: '기억하는 수고 한 가지',
        practice: '최근 아이가 시간을 들여 해낸 일을 구체적으로 기억했다가 짧게 말해요.',
      },
      { title: '발표 당일 약속', practice: '발표를 언제 함께 이야기하면 편할지 아이와 시간을 미리 정해요.' },
      { title: '부모의 한 시간', practice: '가까운 사람과 산책하거나 잠깐 만나 내 기다림도 돌봐요.' },
      {
        title: '일주일 전의 나에게',
        practice: '이번 주에 가장 좋았던 대화를 떠올리고 다음 주에도 건네고 싶은 말을 골라요.',
      },
    ],
  },
} as const satisfies Record<TProduct, IProduct>;

export function reportIntro(product: TProduct, element?: TElement) {
  if (!element)
    return products[product].topic === 'job'
      ? '이미 해낸 일을 떠올려 다음 지원서에 담는 일주일이에요.'
      : '발표를 기다리는 마음을 돌보며 가까운 말부터 건네는 일주일이에요.';
  return (
    '내 풀이의 일간 오행은 ' +
    elementDescriptions[element].label +
    '이에요. ' +
    elementDescriptions[element].focus +
    '을 떠올리며 일주일의 실천을 골라보세요.'
  );
}
