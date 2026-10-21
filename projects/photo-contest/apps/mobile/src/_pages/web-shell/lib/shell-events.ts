import {
  ANALYTICS_EVENT,
  type TAnalyticsEvent,
  type TAnalyticsEventName,
} from '@/features/analytics/config/events';
import type { TCapabilityOutcome } from '@/features/bridge/lib/create-capabilities';
import { toLinkTemplate } from '@/features/navigation/lib/deep-link';
import type { TMonitoringTags } from '@/shared/lib/monitoring/create-monitoring';

type TSocialLoginStatus = Extract<TCapabilityOutcome, { type: 'social-login' }>['status'];

const SOCIAL_LOGIN_EVENT = {
  started: ANALYTICS_EVENT.SocialLoginStarted,
  succeeded: ANALYTICS_EVENT.SocialLoginSucceeded,
  cancelled: ANALYTICS_EVENT.SocialLoginCancelled,
  failed: ANALYTICS_EVENT.SocialLoginFailed,
} as const satisfies Record<TSocialLoginStatus, TAnalyticsEventName>;

/** 브리지 기능(공유·소셜 로그인) 결과를 분석 이벤트로 바꾼다. */
export function toCapabilityEvent(outcome: TCapabilityOutcome): TAnalyticsEvent {
  if (outcome.type === 'share')
    return {
      name:
        outcome.status === 'completed'
          ? ANALYTICS_EVENT.NativeShareCompleted
          : ANALYTICS_EVENT.NativeShareDismissed,
    };
  return { name: SOCIAL_LOGIN_EVENT[outcome.status], properties: { provider: outcome.provider } };
}

/** 딥링크로 연 웹 경로를 이벤트로 바꾼다. 초대 토큰·ID 값은 빼고 path_template만 싣는다. */
export function toDeepLinkEvent(path: string): TAnalyticsEvent | null {
  const template = toLinkTemplate(path);
  return template ? { name: ANALYTICS_EVENT.DeepLinkOpened, properties: { path_template: template } } : null;
}

/** 같은 문제를 분석 이벤트와 Sentry 경고(같은 이름 + 태그)로 함께 남긴다. */
export interface IShellFailureReport {
  event: TAnalyticsEvent;
  /** 값에 URL을 넣지 않는다. 경로에 초대 토큰이 들어갈 수 있다. */
  tags: TMonitoringTags;
}

interface ILoadFailure {
  /** 메인 문서의 HTTP 상태 코드. 응답 없이 연결이 실패하면 0 */
  status: number;
  /** 연결 오류의 네이티브 코드(iOS NSURLError, Android WebViewClient.ERROR_*) */
  code?: number;
  /** iOS만 준다. */
  domain?: string;
}

export function describeLoadFailure({ status, code, domain }: ILoadFailure): IShellFailureReport {
  return {
    event: { name: ANALYTICS_EVENT.WebViewLoadFailed, properties: { status } },
    tags: {
      status: String(status),
      ...(code === undefined ? {} : { error_code: String(code) }),
      ...(domain ? { error_domain: domain } : {}),
    },
  };
}

interface IProcessTermination {
  /** iOS 콘텐츠 프로세스(content) 또는 Android 렌더러(render) */
  process: 'content' | 'render';
  /** Android만 준다. false면 메모리를 회수하려고 OS가 끝냈다. */
  didCrash?: boolean;
}

export function describeProcessTermination({ process, didCrash }: IProcessTermination): IShellFailureReport {
  return {
    event: { name: ANALYTICS_EVENT.WebViewProcessTerminated },
    tags: { process, ...(didCrash === undefined ? {} : { did_crash: String(didCrash) }) },
  };
}
