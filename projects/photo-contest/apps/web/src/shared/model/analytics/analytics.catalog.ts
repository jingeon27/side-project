/**
 * 웹이 보내는 분석 이벤트(contract §6). 이름은 snake_case이고, 속성에 닉네임·캡션·초대 토큰·이메일을 넣지 않는다.
 * ID는 cuid라 넣어도 되고, 경로는 ID를 지운 path_template(`/groups/:id`)로 보낸다. 모두 서버 응답이 성공한 뒤에 보낸다.
 */
export const ANALYTICS_EVENT = {
  CategoryCreated: 'category_created',
  CategoryFilterApplied: 'category_filter_applied',
  PostCreated: 'post_created',
  PageViewed: 'page_viewed',
  LoginStarted: 'login_started',
  LoginSucceeded: 'login_succeeded',
  GroupCreated: 'group_created',
  GroupJoined: 'group_joined',
  InviteLinkCopied: 'invite_link_copied',
  InviteLinkShared: 'invite_link_shared',
  InviteLinkRegenerated: 'invite_link_regenerated',
  ContestCreated: 'contest_created',
  PhotoSubmitted: 'photo_submitted',
  VoteCast: 'vote_cast',
  PhotoLiked: 'photo_liked',
  PhotoUnliked: 'photo_unliked',
  PhotoSortChanged: 'photo_sort_changed',
  ResultViewed: 'result_viewed',
  ResultShared: 'result_shared',
  ContestShared: 'contest_shared',
  PhotoReported: 'photo_reported',
} as const;
export type TAnalyticsEventName = (typeof ANALYTICS_EVENT)[keyof typeof ANALYTICS_EVENT];

/** 공유·복사를 어떤 방법으로 했는지: 앱 기능, Web Share API, 클립보드 */
export const SHARE_METHOD = {
  Native: 'native',
  WebShare: 'web_share',
  Clipboard: 'clipboard',
} as const;
export type TShareMethod = (typeof SHARE_METHOD)[keyof typeof SHARE_METHOD];

/** dev는 개발 서버의 닉네임 로그인 */
export type TLoginMethod = 'google' | 'kakao' | 'dev' | 'password';

/** 대회 사진 정렬(URL 값과 같다) */
export type TPhotoSortValue = 'latest' | 'popular';

interface IContestProperties {
  contest_id: string;
}

interface ISubmissionProperties extends IContestProperties {
  submission_id: string;
}

/** 이벤트마다 보낼 수 있는 속성. 카탈로그에 없는 이벤트·속성은 타입 오류가 난다. */
export type TAnalyticsEventProperties = {
  [ANALYTICS_EVENT.CategoryCreated]: { group_id: string };
  [ANALYTICS_EVENT.CategoryFilterApplied]: { group_id: string; category_id: string };
  [ANALYTICS_EVENT.PostCreated]: {
    group_id: string;
    category_id: string | null;
    kind: 'PHOTO' | 'VIDEO' | 'LINK';
  };
  [ANALYTICS_EVENT.PageViewed]: { path_template: string };
  [ANALYTICS_EVENT.LoginStarted]: { provider: TLoginMethod };
  [ANALYTICS_EVENT.LoginSucceeded]: { provider: TLoginMethod };
  [ANALYTICS_EVENT.GroupCreated]: { group_id: string };
  [ANALYTICS_EVENT.GroupJoined]: { group_id: string };
  [ANALYTICS_EVENT.InviteLinkCopied]: { group_id: string; method: TShareMethod };
  [ANALYTICS_EVENT.InviteLinkShared]: { group_id: string; method: TShareMethod };
  [ANALYTICS_EVENT.InviteLinkRegenerated]: { group_id: string };
  [ANALYTICS_EVENT.ContestCreated]: { group_id: string; contest_id: string };
  [ANALYTICS_EVENT.PhotoSubmitted]: IContestProperties;
  [ANALYTICS_EVENT.VoteCast]: IContestProperties;
  [ANALYTICS_EVENT.PhotoLiked]: ISubmissionProperties;
  [ANALYTICS_EVENT.PhotoUnliked]: ISubmissionProperties;
  [ANALYTICS_EVENT.PhotoSortChanged]: IContestProperties & { sort: TPhotoSortValue };
  [ANALYTICS_EVENT.ResultViewed]: IContestProperties;
  [ANALYTICS_EVENT.ResultShared]: IContestProperties & { method: TShareMethod };
  [ANALYTICS_EVENT.ContestShared]: IContestProperties & { method: TShareMethod };
  [ANALYTICS_EVENT.PhotoReported]: IContestProperties;
};
