/**
 * 웹이 보내는 분석 이벤트(contract §6). 이름은 snake_case이고, 속성에 닉네임·캡션·초대 토큰·이메일을 넣지 않는다.
 * ID는 cuid라 넣어도 되고, 경로는 ID를 지운 path_template(`/groups/:id`)로 보낸다. mutation은 서버 성공 후, 클릭은 해당 동작 시점에 보낸다.
 */
export const ANALYTICS_EVENT = {
  CategoryCreated: 'category_created',
  CategoryFilterApplied: 'category_filter_applied',
  PostCreated: 'post_created',
  PostUploadCancelled: 'post_upload_cancelled',
  PostDraftDiscarded: 'post_draft_discarded',
  PostListPageLoaded: 'post_list_page_loaded',
  PageViewed: 'page_viewed',
  LandingStartClicked: 'landing_start_clicked',
  SignEntryClicked: 'sign_entry_clicked',
  LoginStarted: 'login_started',
  LoginSucceeded: 'login_succeeded',
  GroupCreated: 'group_created',
  GroupJoined: 'group_joined',
  GroupSearchCleared: 'group_search_cleared',
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
} as const satisfies Record<string, string>;
export type TAnalyticsEventName = (typeof ANALYTICS_EVENT)[keyof typeof ANALYTICS_EVENT];

/** 공유·복사를 어떤 방법으로 했는지: 앱 기능, Web Share API, 클립보드 */
export const SHARE_METHOD = {
  Native: 'native',
  WebShare: 'web_share',
  Clipboard: 'clipboard',
} as const satisfies Record<string, string>;
export type TShareMethod = (typeof SHARE_METHOD)[keyof typeof SHARE_METHOD];

/** dev는 개발 서버의 닉네임 로그인 */
export type TLoginMethod = 'password' | 'anonymous';

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
  /** 게시 요청 전, 파일을 올리는 중에 누른 취소. 입력은 그대로 남는다. */
  [ANALYTICS_EVENT.PostUploadCancelled]: { group_id: string; kind: 'PHOTO' | 'VIDEO' };
  /** 입력을 바꾼 글쓰기에서 뒤로 가기를 눌러 묻는 대화상자에서 버리기를 고른 때 */
  [ANALYTICS_EVENT.PostDraftDiscarded]: { group_id: string };
  [ANALYTICS_EVENT.PostListPageLoaded]: { surface: 'latest' | 'public' | 'my'; offset: number };
  [ANALYTICS_EVENT.PageViewed]: { path_template: string };
  [ANALYTICS_EVENT.LandingStartClicked]: {
    placement: 'header' | 'hero' | 'guide';
    source_path_template: string;
    destination_path_template: string;
    redirect_applied: boolean;
    group_id?: string;
  };
  [ANALYTICS_EVENT.SignEntryClicked]: {
    placement: 'bottom_nav' | 'desktop_nav' | 'group_join' | 'login_prompt';
    source_path_template: string;
    destination_path_template: string;
  };
  [ANALYTICS_EVENT.LoginStarted]: { provider: TLoginMethod };
  [ANALYTICS_EVENT.LoginSucceeded]: { provider: TLoginMethod };
  [ANALYTICS_EVENT.GroupCreated]: { group_id: string };
  [ANALYTICS_EVENT.GroupJoined]: { group_id: string };
  [ANALYTICS_EVENT.GroupSearchCleared]: { placement: 'results_header' | 'empty_state' };
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
