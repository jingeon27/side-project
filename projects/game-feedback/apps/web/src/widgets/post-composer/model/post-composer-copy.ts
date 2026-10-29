import type { TBattleMode, TBoardKind, TCoachingDetails } from '@game-feedback/contracts';

interface IPostComposerCopy {
  title: string;
  body: string;
}

export function postComposerCopy(board: TBoardKind, role: TCoachingDetails['role'], mode: TBattleMode) {
  const copy = {
    FEEDBACK: {
      title: '예: 호그 2.6 덱, 페카를 만나면 어떻게 운영하나요?',
      body: '어떤 상황에서 막혔나요? 시도한 방법과 궁금한 점을 적어주세요.',
    },
    FRIEND_SALE: {
      title: '예: 친구 추가 30일 이용권 판매합니다',
      body: '친구 추가 이용 기간과 제공 내용, 가능한 인원, 거래 방식을 알려주세요.',
    },
    FRIENDLY:
      mode === 'TEAM'
        ? {
            title: '예: 주말 저녁 팀전에 함께할 팀원 구해요',
            body: '모집 인원과 역할, 함께할 시간, 참가 조건을 적어주세요.',
          }
        : {
            title: '예: 오늘 저녁 9시에 1:1 연습하실 분',
            body: '가능한 시간과 대전 규칙, 원하는 상대 조건을 적어주세요.',
          },
    COACHING:
      role === 'STUDENT'
        ? {
            title: '예: 목표 달성까지 도와줄 코치 구해요',
            body: '현재 실력과 목표, 배우고 싶은 내용, 가능한 시간과 예산을 알려주세요.',
          }
        : {
            title: '예: 수비와 운영을 함께 연습할 수강생 모집',
            body: '가르칠 분야와 수강 대상, 수업 방식, 일정과 수강료에 포함되는 내용을 적어주세요.',
          },
    FREE: {
      title: '예: 이번 업데이트, 다들 어떻게 느끼셨나요?',
      body: '공유하고 싶은 플레이 이야기나 질문을 편하게 남겨주세요.',
    },
  } satisfies Record<TBoardKind, IPostComposerCopy>;
  return copy[board];
}
