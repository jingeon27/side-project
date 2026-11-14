import { Platform } from 'react-native';

import { applicationId } from 'expo-application';

import { IOS_APP_STORE_ID } from '@/shared/config/env';

import { resolveStoreUrl } from '../lib/store-url';

export function readStoreUrl() {
  return resolveStoreUrl({
    platform: Platform.OS === 'ios' ? 'ios' : 'android',
    androidPackage: applicationId,
    iosAppStoreId: IOS_APP_STORE_ID,
  });
}
