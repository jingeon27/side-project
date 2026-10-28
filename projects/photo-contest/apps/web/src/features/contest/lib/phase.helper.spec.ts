import { describe, expect, it } from 'vitest';

import { Phase } from '@/shared/api/generated';

import { getPhaseDeadline, getPhaseGuide, getPhaseLabel, getPhaseTone, isContestLive } from './phase.helper';

const DATES = {
  startsAt: '2026-10-01T00:00:00.000Z',
  submissionEndsAt: '2026-10-03T00:00:00.000Z',
  endsAt: '2026-10-07T00:00:00.000Z',
};

describe('phase.helper', () => {
  it.each([
    [Phase.Upcoming, '시작 예정', 'neutral'],
    [Phase.Submission, '접수 중', 'brand'],
    [Phase.Voting, '투표 진행 중', 'accent'],
    [Phase.Completed, '대회 종료', 'info'],
  ])('%s 단계는 "%s" 배지여야 한다', (phase, label, tone) => {
    expect(getPhaseLabel(phase)).toBe(label);
    expect(getPhaseTone(phase)).toBe(tone);
  });

  it('단계마다 기다리는 시각을 골라야 한다', () => {
    expect(getPhaseDeadline(Phase.Upcoming, DATES)).toEqual({ label: '시작', at: DATES.startsAt });
    expect(getPhaseDeadline(Phase.Submission, DATES)).toEqual({
      label: '접수 마감',
      at: DATES.submissionEndsAt,
    });
    expect(getPhaseDeadline(Phase.Voting, DATES)).toEqual({ label: '투표 마감', at: DATES.endsAt });
    expect(getPhaseDeadline(Phase.Completed, DATES)).toEqual({ label: '종료', at: DATES.endsAt });
  });

  it('끝나기 전까지만 주기적으로 다시 확인해야 한다', () => {
    expect(isContestLive(Phase.Upcoming)).toBe(true);
    expect(isContestLive(Phase.Voting)).toBe(true);
    expect(isContestLive(Phase.Completed)).toBe(false);
  });

  it('제출·투표 여부에 따라 다음 할 일을 안내해야 한다', () => {
    expect(getPhaseGuide({ phase: Phase.Submission, hasSubmitted: false, hasVoted: false }).title).toBe(
      '이번 대회의 주인공이 되어보세요',
    );
    expect(getPhaseGuide({ phase: Phase.Submission, hasSubmitted: true, hasVoted: false }).title).toBe(
      '사진 제출 완료!',
    );
    expect(getPhaseGuide({ phase: Phase.Voting, hasSubmitted: true, hasVoted: false }).title).toBe(
      '가장 웃긴 사진에 한 표!',
    );
    expect(getPhaseGuide({ phase: Phase.Voting, hasSubmitted: false, hasVoted: true })).toEqual({
      title: '투표 완료!',
      description: '대회가 끝나면 결과를 확인해 주세요.',
    });
    expect(getPhaseGuide({ phase: Phase.Upcoming, hasSubmitted: false, hasVoted: false }).title).toBe(
      '곧 대회가 시작돼요',
    );
    expect(getPhaseGuide({ phase: Phase.Completed, hasSubmitted: true, hasVoted: true }).title).toBe(
      '우리끼리 뽑은 최고의 순간',
    );
  });
});
