import { registerRootComponent } from 'expo';

import { App } from './src/_app/App';
import { initMonitoring, withMonitoring } from './src/shared/lib/monitoring/monitoring';

// 첫 화면을 그리기 전에 오류 수집을 켠다. NEXT_PUBLIC_SENTRY_DSN이 없으면 둘 다 아무것도 하지 않는다.
initMonitoring();
registerRootComponent(withMonitoring(App));
