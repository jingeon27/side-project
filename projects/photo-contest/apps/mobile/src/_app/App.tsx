import { useEffect, useState } from 'react';

import { StatusBar } from 'expo-status-bar';

import { UpdateRequiredPageTemplate } from '@/_pages/update-required';
import { toDeepLinkEvent, WebShellPageTemplate } from '@/_pages/web-shell';
import { ANALYTICS_EVENT, startAnalytics, trackEvent } from '@/features/analytics';
import { readAppVersion, readStoreUrl, UNKNOWN_APP_VERSION, useVersionGate } from '@/features/app-config';
import { readInitialLink, type IInitialLink } from '@/features/navigation';

import { keepSplashScreen, useSplashScreen } from './model/use-splash-screen';
import { AppProviders } from './providers/AppProviders';

keepSplashScreen();

interface IAppLaunch {
  /** 처음 열 웹 경로 */
  initialPath: string;
  /** 웹 분석 SDK가 같은 기기 ID를 쓰도록 앱 정보에 싣는다. 분석 키가 없거나 초기화가 늦으면 null */
  analyticsDeviceId: string | null;
}

function trackLaunch({ path, isDeepLink }: IInitialLink) {
  trackEvent({
    name: ANALYTICS_EVENT.AppOpened,
    properties: { source: isDeepLink ? 'deep_link' : 'launch' },
  });
  const deepLinkEvent = isDeepLink ? toDeepLinkEvent(path) : null;
  if (deepLinkEvent) trackEvent(deepLinkEvent);
}

interface IAppScreensProps {
  /** 첫 링크와 분석 기기 ID를 읽는 동안은 null */
  launch: IAppLaunch | null;
  onReady: () => void;
}

/**
 * 첫 링크를 읽는 동안은 스플래시가 덮고 있다. 버전 검사는 웹 로딩과 함께 진행해 시작을 늦추지 않고,
 * 최소 버전보다 낮다고 확인되면 그때 업데이트 화면으로 바꾼다.
 */
function AppScreens({ launch, onReady }: IAppScreensProps) {
  const [appVersion] = useState(readAppVersion);
  const [storeUrl] = useState(readStoreUrl);
  const versionGate = useVersionGate({ appVersion });

  if (versionGate.status === 'update-required')
    return (
      <UpdateRequiredPageTemplate
        currentVersion={appVersion ?? UNKNOWN_APP_VERSION}
        minimumVersion={versionGate.minimumVersion}
        storeUrl={storeUrl}
        onShown={onReady}
      />
    );
  if (launch === null) return null;
  return (
    <WebShellPageTemplate
      initialPath={launch.initialPath}
      appVersion={appVersion ?? UNKNOWN_APP_VERSION}
      analyticsDeviceId={launch.analyticsDeviceId}
      onReady={onReady}
    />
  );
}

export function App() {
  const handleScreenReady = useSplashScreen();
  const [launch, setLaunch] = useState<IAppLaunch | null>(null);

  // 기기 ID는 웹 문서보다 먼저 심어야 해서 첫 링크와 함께 WebView를 열기 전에 받는다.
  // 오류 경계 밖인 앱 루트에서 읽어, 화면을 다시 시작해도 app_opened를 다시 보내지 않는다.
  useEffect(() => {
    let isActive = true;
    // 둘 다 거부하지 않는다(실패하면 홈 경로, 기기 ID 없음). 그래서 스플래시에 갇히지 않는다.
    void Promise.all([readInitialLink(), startAnalytics()]).then(([link, analyticsDeviceId]) => {
      if (!isActive) return;
      trackLaunch(link);
      setLaunch({ initialPath: link.path, analyticsDeviceId });
    });
    return () => {
      isActive = false;
    };
  }, []);

  return (
    <AppProviders>
      <StatusBar style="dark" />
      <AppScreens launch={launch} onReady={handleScreenReady} />
    </AppProviders>
  );
}
