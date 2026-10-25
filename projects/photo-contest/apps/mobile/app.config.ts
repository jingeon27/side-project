import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { ConfigContext, ExpoConfig } from 'expo/config';

const projectEnv = fileURLToPath(new URL('../../.env', import.meta.url));
if (existsSync(projectEnv)) process.loadEnvFile(projectEnv);
const APP_ID = 'dev.side.photocontest';

export interface IBuildSettings {
  isDevelopment: boolean;
  webOrigin: string;
}

export function readBuildSettings(env: Record<string, string | undefined>): IBuildSettings {
  const isDevelopment = ['development', 'test'].includes(env.NODE_ENV ?? 'production');
  const origin = URL.parse(env.WEB_ORIGIN ?? (isDevelopment ? 'http://localhost:3200' : ''));
  if (
    !origin ||
    !['http:', 'https:'].includes(origin.protocol) ||
    origin.username ||
    origin.password ||
    origin.pathname !== '/' ||
    origin.search ||
    origin.hash ||
    (!isDevelopment && origin.protocol !== 'https:')
  )
    throw new Error('WEB_ORIGIN must be an HTTPS origin for production builds.');
  return { isDevelopment, webOrigin: origin.origin };
}

export default function appConfig({ config }: ConfigContext): ExpoConfig {
  const settings = readBuildSettings(process.env);
  const googleServicesFile = fileURLToPath(new URL('./google-services.json', import.meta.url));
  return {
    ...config,
    name: '별사대',
    slug: 'photo-contest',
    version: '1.0.0',
    icon: './assets/icon.png',
    scheme: 'photocontest',
    orientation: 'portrait',
    userInterfaceStyle: 'automatic',
    backgroundColor: '#ffffff',
    ios: {
      bundleIdentifier: APP_ID,
      deploymentTarget: '17.4',
      infoPlist: {
        NSCameraUsageDescription: '사진과 동영상을 촬영할 때 카메라를 사용합니다.',
        NSPhotoLibraryUsageDescription: '사진과 동영상을 선택할 때 사진 보관함을 사용합니다.',
        NSMicrophoneUsageDescription: '동영상을 촬영할 때 소리를 녹음합니다.',
        ...(settings.isDevelopment ? { NSAppTransportSecurity: { NSAllowsLocalNetworking: true } } : {}),
      },
    },
    android: {
      package: APP_ID,
      adaptiveIcon: { foregroundImage: './assets/adaptive-icon.png', backgroundColor: '#e85d4a' },
      ...(existsSync(googleServicesFile) ? { googleServicesFile } : {}),
      allowBackup: false,
      predictiveBackGestureEnabled: false,
    },
    plugins: [
      ['expo-notifications', { defaultChannel: 'activity' }],
      ['expo-build-properties', { android: settings.isDevelopment ? { usesCleartextTraffic: true } : {} }],
      ['expo-splash-screen', { backgroundColor: '#ffffff', dark: { backgroundColor: '#141312' } }],
      '@sentry/react-native/expo',
    ],
    extra: {
      ...config.extra,
      webOrigin: settings.webOrigin,
      sentryDsn: process.env.NEXT_PUBLIC_SENTRY_DSN || null,
      amplitudeApiKey: process.env.NEXT_PUBLIC_AMPLITUDE_API_KEY || null,
    },
  };
}
