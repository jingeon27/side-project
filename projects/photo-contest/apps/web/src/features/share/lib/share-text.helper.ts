/** 앱 공유 시트(share.open)가 받는 길이. 넘으면 앱이 요청을 거절한다. */
export const SHARE_TEXT_MAX_LENGTH = 500;
export const SHARE_TITLE_MAX_LENGTH = 100;
/** 공동 우승이 많으면 앞의 몇 명만 이름을 적는다. */
const MAX_NAMED_WINNERS = 3;
const CAPTION_MAX_LENGTH = 40;

export interface IShareWinner {
  nickname: string;
  caption: string;
  voteCount: number;
}

const truncate = (value: string, max: number) =>
  Array.from(value).length > max ? `${Array.from(value).slice(0, max - 1).join('')}…` : value;

const describeWinner = ({ nickname, caption }: IShareWinner, captionMax: number) =>
  `${nickname}님의 ‘${truncate(caption.trim(), captionMax)}’`;

function buildWinnerLine(title: string, winners: readonly IShareWinner[], captionMax: number) {
  const [first] = winners;
  if (!first) return `🏆 ${title} 우승작 없이 마무리`;
  if (winners.length === 1) return `🏆 ${title} 우승: ${describeWinner(first, captionMax)} (${first.voteCount}표)`;
  const named = winners.slice(0, MAX_NAMED_WINNERS).map((winner) => describeWinner(winner, captionMax));
  const rest = winners.length - named.length;
  return `🏆 ${title} 공동 우승: ${named.join(', ')}${rest > 0 ? ` 외 ${rest}명` : ''} (각 ${first.voteCount}표)`;
}

/**
 * 결과 공유 문구. 링크는 공유할 때 따로 붙는다.
 * - 우승 1명: `🏆 <대회> 우승: <닉네임>님의 ‘<캡션>’ (<n>표)`
 * - 공동 우승: 앞의 세 명까지 이름을 적고 나머지는 "외 n명"
 * - 무투표: `🏆 <대회> 우승작 없이 마무리`
 * 앱 공유 시트 한도(500자)를 넘지 않게 캡션을 줄인다.
 */
export function buildResultShareText(contestTitle: string, winners: readonly IShareWinner[]) {
  const title = truncate(contestTitle.trim(), SHARE_TITLE_MAX_LENGTH);
  for (const captionMax of [CAPTION_MAX_LENGTH, 16, 4]) {
    const line = buildWinnerLine(title, winners, captionMax);
    if (Array.from(line).length <= SHARE_TEXT_MAX_LENGTH) return line;
  }
  return truncate(buildWinnerLine(title, winners, 4), SHARE_TEXT_MAX_LENGTH);
}

/** 대회 링크 공유 문구 */
export function buildContestShareText(contestTitle: string) {
  return `‘${truncate(contestTitle.trim(), SHARE_TITLE_MAX_LENGTH)}’ 사진 대회가 열렸어요! 웃긴 순간을 한 장 골라 주세요.`;
}

/** 그룹 초대 문구 */
export function buildInviteShareText(groupName: string) {
  return `‘${truncate(groupName.trim(), SHARE_TITLE_MAX_LENGTH)}’ 그룹에 초대할게요. 웃긴순간에서 같이 사진 대회 해요!`;
}
