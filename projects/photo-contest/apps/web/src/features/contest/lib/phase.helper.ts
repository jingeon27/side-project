import { match } from 'ts-pattern';

import { Phase } from '@/shared/api/generated';

export type TPhaseTone = 'neutral' | 'brand' | 'accent' | 'info';

interface IPhaseDates {
  startsAt: string;
  submissionEndsAt: string;
  endsAt: string;
}

/** 단계 배지 글자. 색만으로 단계를 알리지 않도록 늘 글자를 함께 쓴다. */
export function getPhaseLabel(phase: Phase) {
  return match(phase)
    .with(Phase.Upcoming, () => '시작 예정')
    .with(Phase.Submission, () => '접수 중')
    .with(Phase.Voting, () => '투표 진행 중')
    .with(Phase.Completed, () => '대회 종료')
    .exhaustive();
}

export function getPhaseTone(phase: Phase): TPhaseTone {
  return match(phase)
    .returnType<TPhaseTone>()
    .with(Phase.Upcoming, () => 'neutral')
    .with(Phase.Submission, () => 'brand')
    .with(Phase.Voting, () => 'accent')
    .with(Phase.Completed, () => 'info')
    .exhaustive();
}

/** 지금 단계에서 사람들이 기다리는 시각(시작·사진 마감·투표 마감·종료) */
export function getPhaseDeadline(phase: Phase, dates: IPhaseDates) {
  return match(phase)
    .with(Phase.Upcoming, () => ({ label: '시작', at: dates.startsAt }))
    .with(Phase.Submission, () => ({ label: '접수 마감', at: dates.submissionEndsAt }))
    .with(Phase.Voting, () => ({ label: '투표 마감', at: dates.endsAt }))
    .with(Phase.Completed, () => ({ label: '종료', at: dates.endsAt }))
    .exhaustive();
}

/** 단계가 서버 시각으로 바뀌므로 끝나기 전까지는 주기적으로 다시 확인한다. */
export function isContestLive(phase: Phase) {
  return phase !== Phase.Completed;
}

interface IPhaseGuideInput {
  phase: Phase;
  hasSubmitted: boolean;
  hasVoted: boolean;
}

/** 대회 화면 상단 안내. 단계와 내 참여 상태에 따라 다음에 할 일을 알려 준다. */
export function getPhaseGuide({ phase, hasSubmitted, hasVoted }: IPhaseGuideInput) {
  return match({ phase, hasSubmitted, hasVoted })
    .with({ phase: Phase.Upcoming }, () => ({
      title: '곧 대회가 시작돼요',
      description: '웃긴 사진을 미리 골라 두세요. 시작하면 한 사람당 한 장을 낼 수 있어요.',
    }))
    .with({ phase: Phase.Submission, hasSubmitted: true }, () => ({
      title: '사진 제출 완료!',
      description: '친구들의 사진을 기다려요. 제출이 끝나면 투표가 시작돼요.',
    }))
    .with({ phase: Phase.Submission }, () => ({
      title: '이번 대회의 주인공이 되어보세요',
      description: '사진첩 속 숨겨둔 한 장, 지금 꺼내볼까요? 한 사람당 사진 한 장이에요.',
    }))
    .with({ phase: Phase.Voting, hasVoted: true }, () => ({
      title: '투표 완료!',
      description: '대회가 끝나면 결과를 확인해 주세요.',
    }))
    .with({ phase: Phase.Voting }, () => ({
      title: '가장 웃긴 사진에 한 표!',
      description: '결과는 대회가 끝나면 공개돼요. 내 사진에는 투표할 수 없어요.',
    }))
    .with({ phase: Phase.Completed }, () => ({
      title: '우리끼리 뽑은 최고의 순간',
      description: '다음 대회에서 또 만나요!',
    }))
    .exhaustive();
}
