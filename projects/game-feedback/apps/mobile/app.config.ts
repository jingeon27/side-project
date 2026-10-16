import type { ConfigContext, ExpoConfig } from 'expo/config';

const IS_DEVELOPMENT = process.env.APP_VARIANT === 'development';
export default function appConfig({ config }: ConfigContext): ExpoConfig {
  return {
    ...config,
    name: '플레이메이트',
    slug: 'game-feedback',
    version: '1.0.0',
    scheme: 'gamefeedback',
    orientation: 'portrait',
    userInterfaceStyle: 'light',
    backgroundColor: '#ffffff',
    ios: {
      bundleIdentifier: 'dev.side.gamefeedback',
      infoPlist: {
        NSAppTransportSecurity: IS_DEVELOPMENT ? { NSAllowsLocalNetworking: true } : {},
      },
    },
    android: { package: 'dev.side.gamefeedback', predictiveBackGestureEnabled: false },
    plugins: [['expo-build-properties', { android: IS_DEVELOPMENT ? { usesCleartextTraffic: true } : {} }]],
  };
}
