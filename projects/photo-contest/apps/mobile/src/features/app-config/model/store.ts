import { Platform } from 'react-native';

import { applicationId } from 'expo-application';

import { resolveStoreUrl } from '../lib/store-url';

export function readStoreUrl() {
  return resolveStoreUrl({
    platform: Platform.OS === 'ios' ? 'ios' : 'android',
    androidPackage: applicationId,
  });
}
