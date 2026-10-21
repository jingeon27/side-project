import { Platform } from 'react-native';

import { applicationId } from 'expo-application';

import { STORE_URL } from '@/shared/config/env';

import { resolveStoreUrl } from '../lib/store-url';

export function readStoreUrl() {
  return resolveStoreUrl({
    platform: Platform.OS === 'ios' ? 'ios' : 'android',
    configuredUrl: STORE_URL,
    androidPackage: applicationId,
  });
}
