import type { ConfigContext, ExpoConfig } from 'expo/config';

const IS_DEVELOPMENT = process.env.APP_VARIANT === 'development';
export default function appConfig({ config }: ConfigContext): ExpoConfig {
  return {
    ...config,
    name: 'Game Mate',
    icon: './assets/icon.png',
    slug: 'game-feedback',
    version: '1.0.0',
    scheme: 'gamefeedback',
    orientation: 'portrait',
    userInterfaceStyle: 'light',
    backgroundColor: '#ffffff',
    ios: {
      bundleIdentifier: 'dev.side.gamefeedback',
      infoPlist: {
        NSPhotoLibraryUsageDescription: '채팅에서 사진과 동영상을 선택해 전송할 때 사진 보관함을 사용합니다.',
        NSCameraUsageDescription: '채팅에 전송할 사진이나 동영상을 촬영할 때 카메라를 사용합니다.',
        NSMicrophoneUsageDescription: '채팅에 전송할 동영상을 촬영할 때 소리를 녹음합니다.',
        NSAppTransportSecurity: IS_DEVELOPMENT ? { NSAllowsLocalNetworking: true } : {},
      },
    },
    android: {
      adaptiveIcon: { foregroundImage: './assets/adaptive-icon.png', backgroundColor: '#111827' },
      package: 'dev.side.gamefeedback',
      predictiveBackGestureEnabled: false,
    },
    plugins: [['expo-build-properties', { android: IS_DEVELOPMENT ? { usesCleartextTraffic: true } : {} }]],
  };
}
