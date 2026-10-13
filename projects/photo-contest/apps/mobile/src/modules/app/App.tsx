import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';

import { UNKNOWN_APP_VERSION, readAppVersion } from '@/modules/features/app-config/model/app-version';
import { readStoreUrl } from '@/modules/features/app-config/model/store';
import { useVersionGate } from '@/modules/features/app-config/model/use-version-gate';
import { useInitialPath } from '@/modules/features/navigation/model/use-initial-path';
import { UpdateRequiredPageTemplate } from '@/modules/pages/update-required/@page/UpdateRequiredPageTemplate';
import { WebShellPageTemplate } from '@/modules/pages/web-shell/@page/WebShellPageTemplate';

import { keepSplashScreen, useSplashScreen } from './model/use-splash-screen';
import { AppProviders } from './providers/AppProviders';

keepSplashScreen();

interface IAppScreensProps {
  onReady: () => void;
}

/**
 * 첫 링크를 읽는 동안은 스플래시가 덮고 있다. 버전 검사는 웹 로딩과 함께 진행해 시작을 늦추지 않고,
 * 최소 버전보다 낮다고 확인되면 그때 업데이트 화면으로 바꾼다.
 */
function AppScreens({ onReady }: IAppScreensProps) {
  const [appVersion] = useState(readAppVersion);
  const [storeUrl] = useState(readStoreUrl);
  const initialPath = useInitialPath();
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
  if (initialPath === null) return null;
  return (
    <WebShellPageTemplate
      initialPath={initialPath}
      appVersion={appVersion ?? UNKNOWN_APP_VERSION}
      onReady={onReady}
    />
  );
}

export function App() {
  const hideSplash = useSplashScreen();

  return (
    <AppProviders>
      <StatusBar style="dark" />
      <AppScreens onReady={hideSplash} />
    </AppProviders>
  );
}
