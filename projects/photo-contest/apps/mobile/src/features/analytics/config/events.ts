/** 앱을 새로 띄운 계기. 앱이 아는 링크(앱 스킴·유니버설 링크)로 열렸으면 deep_link */
export type TAppOpenSource = 'launch' | 'deep_link';

/**
 * 모바일 이벤트와 속성(contract §6). 속성에는 닉네임·캡션·초대 토큰·이메일을 넣지 않는다.
 * 경로는 ID·토큰을 `:id`·`:token`으로 바꾼 path_template만 보낸다.
 */
export interface IAnalyticsEventProperties {
  /** 프로세스가 새로 뜰 때 한 번 */
  app_opened: { source: TAppOpenSource };
  /** 실제로 background에 다녀왔을 때만 (iOS inactive는 제외) */
  app_foregrounded: undefined;
  deep_link_opened: { path_template: string };
  /** Android는 OS가 공유 결과를 알려 주지 않아 시트를 닫아도 completed로 온다. */
  native_share_completed: undefined;
  native_share_dismissed: undefined;
  update_required_shown: { minimum_version: string };
  /** status: 메인 문서의 HTTP 상태 코드(5xx). 응답 없이 연결이 실패하면 0 */
  webview_load_failed: { status: number };
  webview_process_terminated: undefined;
}

export type TAnalyticsEventName = keyof IAnalyticsEventProperties;

/** 호출하는 곳에서 이벤트 이름 문자열 대신 쓴다. */
export const ANALYTICS_EVENT = {
  AppOpened: 'app_opened',
  AppForegrounded: 'app_foregrounded',
  DeepLinkOpened: 'deep_link_opened',
  NativeShareCompleted: 'native_share_completed',
  NativeShareDismissed: 'native_share_dismissed',
  UpdateRequiredShown: 'update_required_shown',
  WebViewLoadFailed: 'webview_load_failed',
  WebViewProcessTerminated: 'webview_process_terminated',
} as const satisfies Record<string, TAnalyticsEventName>;

/** 이름과 속성을 한 값으로 묶어 이름마다 맞는 속성만 받는다. 속성이 없는 이벤트는 properties가 없다. */
export type TAnalyticsEvent = {
  [TName in TAnalyticsEventName]: IAnalyticsEventProperties[TName] extends undefined
    ? { name: TName }
    : { name: TName; properties: IAnalyticsEventProperties[TName] };
}[TAnalyticsEventName];
