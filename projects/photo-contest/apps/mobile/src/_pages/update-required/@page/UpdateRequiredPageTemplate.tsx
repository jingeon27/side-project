import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ANALYTICS_EVENT } from '@/features/analytics/config/events';
import { trackEvent } from '@/features/analytics/model/analytics';
import { openExternalUrl } from '@/features/navigation/model/open-external';
import { COLORS } from '@/shared/config/theme';

interface IUpdateRequiredPageTemplateProps {
  currentVersion: string;
  minimumVersion: string;
  /** 없으면 스토어 버튼을 숨긴다. */
  storeUrl: string | null;
  /** 화면이 그려지면 스플래시를 닫는다. */
  onShown: () => void;
}

/** 서버가 정한 최소 버전보다 낮은 앱. 웹 화면과 브리지 계약이 맞지 않을 수 있어 웹을 열지 않는다. */
export function UpdateRequiredPageTemplate({
  currentVersion,
  minimumVersion,
  storeUrl,
  onShown,
}: IUpdateRequiredPageTemplateProps) {
  useEffect(() => {
    onShown();
  }, [onShown]);

  useEffect(() => {
    trackEvent({
      name: ANALYTICS_EVENT.UpdateRequiredShown,
      properties: { minimum_version: minimumVersion },
    });
  }, [minimumVersion]);

  function handleOpenStore() {
    if (storeUrl) void openExternalUrl(storeUrl, null);
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.root}>
      <View style={styles.content}>
        <Text style={styles.title} accessibilityRole="header">
          새 버전으로 업데이트해 주세요
        </Text>
        <Text style={styles.description}>
          지금 버전에서는 더 이상 사진 공모전을 이용할 수 없어요. 스토어에서 최신 버전을 받아 주세요.
        </Text>
        <Text style={styles.version}>
          현재 버전 {currentVersion} · 필요한 버전 {minimumVersion} 이상
        </Text>
        {storeUrl ? (
          <Pressable
            accessibilityRole="button"
            onPress={handleOpenStore}
            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
          >
            <Text style={styles.buttonLabel}>업데이트하기</Text>
          </Pressable>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  title: {
    marginBottom: 12,
    color: COLORS.ink,
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
  },
  description: {
    marginBottom: 12,
    color: COLORS.muted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  version: {
    marginBottom: 28,
    color: COLORS.muted,
    fontSize: 13,
  },
  button: {
    minWidth: 180,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    borderRadius: 12,
    backgroundColor: COLORS.brand,
  },
  buttonPressed: {
    backgroundColor: COLORS.brandPressed,
  },
  buttonLabel: {
    color: COLORS.surface,
    fontSize: 16,
    fontWeight: '600',
  },
});
