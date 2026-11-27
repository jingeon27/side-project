import { episodes } from '@/shared/episodes';

import type { TElement, TReadingInput } from './contracts';
import { experienceThemes } from './experience';

export const elementDescriptions = {
  wood: { label: '목(木)', focus: '작은 시도를 시작하고 경험을 키우는 힘' },
  fire: { label: '화(火)', focus: '마음을 표현하고 다른 사람의 반응을 읽는 힘' },
  earth: { label: '토(土)', focus: '일상의 리듬을 되찾고 마음이 쉴 자리를 만드는 힘' },
  metal: { label: '금(金)', focus: '흩어진 생각을 정리하고 중요한 것을 고르는 힘' },
  water: { label: '수(水)', focus: '상황을 천천히 살피며 새 길을 찾는 힘' },
} satisfies Record<TElement, { label: string; focus: string }>;

export function practiceFor(input: TReadingInput) {
  const [first, second, third, fourth] = episodes;
  return (
    (
      {
        silence: first,
        comparison: third,
        'first-words': second,
        scores: fourth,
        'family-talk': fourth,
        interview: {
          action: '내가 했던 일을 한 문장으로 말해보기',
          alternative: '면접에서 꺼내고 싶은 경험 하나 적어보기',
        },
        waiting: {
          action: '아이에게 같이 밥 먹을 시간을 물어보기',
          alternative: '기다리면서 나도 오늘 해낸 일 하나 적기',
        },
      } as Partial<Record<string, { action: string; alternative: string }>>
    )[input.concern] ?? {
      action: '오늘 도움을 받은 일 한 가지 떠올리기',
      alternative: '나에게 건네고 싶은 덕담 한 줄 쓰기',
    }
  );
}

const reassurance: Record<string, string> = {
  silence: '답장을 오래 기다리면 이미 해낸 일까지 작게 느껴질 때가 있어요.',
  comparison: '친구에게 기쁜 마음과 나에게 힘든 마음이 같은 날에 올 수 있어요.',
  interview: '면접을 준비할 때는 기억에 남는 장면 하나부터 말해보면 시작하기 쉬워요.',
  'first-words': '조심스러운 날엔 아이에게 익숙하고 짧은 말부터 건네보세요.',
  waiting: '발표를 기다리면서 집에서 함께 할 일 하나를 정해보세요.',
  scores: '성적을 확인하기 전에 오늘 필요한 반응이 무엇인지 생각해보세요.',
  'family-talk': '가족도 말을 꺼낼 때를 재고 있을 수 있어요. 먼저 듣고 싶은 한 문장을 골라보세요.',
};

export function basicInterpretation(input: TReadingInput) {
  const element = elementDescriptions[input.element];
  const experience = input.experience ? ' ' + experienceThemes[input.experience].followUp : '';
  return (
    '사주에서 ' +
    element.label +
    '은 ' +
    element.focus +
    '을 떠올리게 해요. ' +
    reassurance[input.concern] +
    experience
  );
}
