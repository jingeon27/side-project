import { describe, expect, it } from 'vitest';

import {
  buildContestShareText,
  buildInviteShareText,
  buildResultShareText,
  SHARE_TEXT_MAX_LENGTH,
} from './share-text.helper';

describe('buildResultShareText', () => {
  it('우승작이 하나면 닉네임·캡션·득표수를 적어야 한다', () => {
    expect(
      buildResultShareText('이번 주 웃긴 사진', [
        { nickname: '진건', caption: '고양이 기지개', voteCount: 3 },
      ]),
    ).toBe('🏆 이번 주 웃긴 사진 우승: 진건님의 ‘고양이 기지개’ (3표)');
  });

  it('공동 우승이면 모두 적고 같은 득표수를 한 번만 적어야 한다', () => {
    expect(
      buildResultShareText('가을 사진전', [
        { nickname: '진건', caption: '낙엽 샤워', voteCount: 2 },
        { nickname: '수아', caption: '도토리 모자', voteCount: 2 },
      ]),
    ).toBe('🏆 가을 사진전 공동 우승: 진건님의 ‘낙엽 샤워’, 수아님의 ‘도토리 모자’ (각 2표)');
  });

  it('공동 우승이 많으면 세 명까지만 이름을 적어야 한다', () => {
    const winners = ['가', '나', '다', '라', '마'].map((nickname) => ({
      nickname,
      caption: '사진',
      voteCount: 1,
    }));
    expect(buildResultShareText('대회', winners)).toBe(
      '🏆 대회 공동 우승: 가님의 ‘사진’, 나님의 ‘사진’, 다님의 ‘사진’ 외 2명 (각 1표)',
    );
  });

  it('표를 받은 사진이 없으면 우승작 없이 마무리됐다고 적어야 한다', () => {
    expect(buildResultShareText('겨울 사진전', [])).toBe('🏆 겨울 사진전 우승작 없이 마무리');
  });

  it('긴 캡션은 줄여서 앱 공유 한도를 넘지 않아야 한다', () => {
    const long = '아'.repeat(160);
    const text = buildResultShareText('제'.repeat(80), [
      { nickname: '닉'.repeat(24), caption: long, voteCount: 10 },
      { nickname: '네'.repeat(24), caption: long, voteCount: 10 },
      { nickname: '임'.repeat(24), caption: long, voteCount: 10 },
    ]);
    expect(Array.from(text).length).toBeLessThanOrEqual(SHARE_TEXT_MAX_LENGTH);
    expect(text).toContain('…');
    expect(text).toContain('(각 10표)');
  });
});

describe('공유 문구', () => {
  it('대회·초대 문구에 제목과 이름을 담아야 한다', () => {
    expect(buildContestShareText(' 가을 사진전 ')).toBe(
      '‘가을 사진전’ 사진 대회가 열렸어요! 웃긴 순간을 한 장 골라 주세요.',
    );
    expect(buildInviteShareText('웃음 연구소')).toBe(
      '‘웃음 연구소’ 그룹에 초대할게요. 웃긴순간에서 사진과 동영상을 함께 나눠요!',
    );
  });
});
