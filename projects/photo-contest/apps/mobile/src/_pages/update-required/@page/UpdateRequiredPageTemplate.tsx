import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ANALYTICS_EVENT, trackEvent } from '@/features/analytics';
import { openExternalUrl } from '@/features/navigation';
import type { TNativeColors } from '@/shared/config/theme';
import { useAppearance } from '@/shared/model/appearance';

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
  const { colors, dark } = useAppearance();
  const styles = createStyles(colors);
  useEffect(() => {
    onShown();
  }, [onShown]);

  useEffect(() => {
    trackEvent({
      name: ANALYTICS_EVENT.UpdateRequiredShown,
      properties: { minimum_version: minimumVersion },
    });
  }, [minimumVersion]);

  const handleOpenStore = () => {
    if (storeUrl) void openExternalUrl(storeUrl, null);
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.root}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <View style={styles.content}>
        <Text style={styles.title} accessibilityRole="header">
          새 버전으로 업데이트해 주세요
        </Text>
        <Text style={styles.description}>
          지금 버전에서는 더 이상 별사대를 이용할 수 없어요. 스토어에서 최신 버전으로 업데이트해 주세요.
        </Text>
        <Text style={styles.version}>
          현재 {currentVersion} 버전을 사용 중이에요. {minimumVersion} 이상이 필요해요.
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

function createStyles(colors: TNativeColors) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 32,
    },
    title: {
      marginBottom: 12,
      color: colors.ink,
      fontSize: 22,
      fontWeight: '700',
      textAlign: 'center',
    },
    description: {
      marginBottom: 12,
      color: colors.muted,
      fontSize: 15,
      lineHeight: 22,
      textAlign: 'center',
    },
    version: {
      marginBottom: 28,
      color: colors.muted,
      fontSize: 13,
      lineHeight: 20,
      textAlign: 'center',
    },
    button: {
      minWidth: 180,
      minHeight: 48,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 24,
      borderRadius: 12,
      backgroundColor: colors.brand,
    },
    buttonPressed: {
      backgroundColor: colors.brandPressed,
    },
    buttonLabel: {
      color: colors.surface,
      fontSize: 16,
      fontWeight: '600',
    },
  });
}
