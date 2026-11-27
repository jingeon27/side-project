import { z } from 'zod';

export const topicSchema = z.enum(['job', 'parent', 'admission']);
export type TTopic = z.infer<typeof topicSchema>;

export const topics = {
  job: {
    label: '취업 준비',
    description: '답장을 기다리는 중이에요',
    concerns: [
      { id: 'silence', label: '지원했는데 답장이 없어요' },
      { id: 'comparison', label: '친구의 합격 소식이 버거워요' },
      { id: 'interview', label: '다음 면접이 걱정돼요' },
    ],
  },
  parent: {
    label: '자녀 응원',
    description: '아이에게 어떤 말을 건넬까요',
    concerns: [
      { id: 'first-words', label: '아이에게 무슨 말을 할지 모르겠어요' },
      { id: 'waiting', label: '아이보다 제가 더 떨려요' },
    ],
  },
  admission: {
    label: '대입 준비',
    description: '성적이나 발표를 앞두고 있어요',
    concerns: [
      { id: 'scores', label: '성적 발표가 신경 쓰여요' },
      { id: 'family-talk', label: '집에서 성적 얘기를 꺼내기 어려워요' },
    ],
  },
} as const satisfies Record<
  TTopic,
  { label: string; description: string; concerns: readonly { id: string; label: string }[] }
>;
