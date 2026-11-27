import { z } from 'zod';

export const experienceThemeSchema = z.enum([
  'interview',
  'application',
  'study',
  'conversation',
  'waiting',
  'change',
  'reflection',
]);

export type TExperienceTheme = z.infer<typeof experienceThemeSchema>;

export const experienceThemes = {
  interview: {
    label: '면접이나 발표에 관한 과거 경험',
    cue: /면접|발표\s*(?:자료|연습|준비|를\s*했|할 때)|질문에\s*(?:답|대답)|말하기\s*연습/,
    followUp: '지난번에 질문에 답하거나 말을 정리할 때 도움이 됐던 방법을 한 가지 떠올려 보세요.',
  },
  application: {
    label: '지원서나 서류에 관한 과거 경험',
    cue: /지원서|서류|이력서|자소서|자기소개서|입사\s*지원/,
    followUp: '이전에 지원서를 쓸 때 잘 설명할 수 있었던 경험을 한 가지 골라 보세요.',
  },
  study: {
    label: '공부나 시험에 관한 과거 경험',
    cue: /수능|시험|모의고사|성적|과제|공부|복습|학원/,
    followUp: '이전에 공부가 막혔을 때 도움이 됐던 준비 방법을 한 가지 떠올려 보세요.',
  },
  conversation: {
    label: '가족이나 주변 사람과 나눈 대화',
    cue: /부모|엄마|아빠|가족|자녀|아이에게|대화|상담|친구(?:가|와|에게)\s*.{0,8}(?:말|얘기|도와)/,
    followUp: '비슷한 이야기를 나눌 때 상대가 편하게 듣던 말이나 시간을 떠올려 보세요.',
  },
  waiting: {
    label: '발표나 연락을 기다렸던 경험',
    cue: /기다렸|기다리던|연락(?:이|을)|답장|합격|불합격|발표가/,
    followUp: '결과를 기다리던 날 마음을 가라앉히는 데 도움이 됐던 일을 한 가지 골라 보세요.',
  },
  change: {
    label: '일상의 변화에 적응했던 경험',
    cue: /이직|이사|전학|퇴사|휴학|재도전|계획을\s*(?:바꾸|고치)|새로운\s*환경/,
    followUp: '새로운 상황에서 처음으로 해볼 만했던 작은 행동을 떠올려 보세요.',
  },
  reflection: {
    label: '지난 사건에서 내가 했던 대응과 달라진 점',
    cue: null,
    followUp: '적어본 일에서 내가 했던 행동과 그 뒤 달라진 점을 한 가지씩 떠올려 보세요.',
  },
} satisfies Record<TExperienceTheme, { label: string; cue: RegExp | null; followUp: string }>;

export function classifyExperience(text: string): TExperienceTheme | undefined {
  const description = text.trim().normalize('NFC');
  if (!description) return undefined;
  return (
    experienceThemeSchema.options.find((theme) => experienceThemes[theme].cue?.test(description)) ??
    'reflection'
  );
}
