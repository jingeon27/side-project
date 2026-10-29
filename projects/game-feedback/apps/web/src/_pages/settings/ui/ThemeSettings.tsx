'use client';

import { Monitor, Moon, Sun, SunMoon } from 'lucide-react';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@side/design-system';

import { useI18n } from '@/shared/i18n';
import { setThemePreference, themePreference, useThemePreference } from '@/shared/theme';
import { useNotify } from '@/shared/ui';

export function ThemeSettings() {
  const { t } = useI18n();
  const preference = useThemePreference();
  const notify = useNotify();
  const items = [
    { value: 'system', label: t('기기 설정에 맞춤'), icon: Monitor },
    { value: 'light', label: t('라이트 모드'), icon: Sun },
    { value: 'dark', label: t('다크 모드'), icon: Moon },
  ];
  const handleChange = (value: string | null) => {
    if (!value || value === preference) return;
    setThemePreference(themePreference(value));
    notify(t('화면 모드를 변경했어요'));
  };
  return (
    <section className="settings-card theme-settings" aria-labelledby="theme-title">
      <h2 id="theme-title">
        <SunMoon size={19} aria-hidden="true" />
        {t('화면 모드')}
      </h2>
      <Select items={items} value={preference} onValueChange={handleChange}>
        <SelectTrigger id="theme-preference" className="w-full" aria-label={t('화면 모드')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="start" alignItemWithTrigger={false}>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              <span className="preference-option">
                <item.icon size={16} aria-hidden />
                {item.label}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="settings-help muted small">{t('변경한 화면 모드는 이 기기에 저장돼요.')}</p>
    </section>
  );
}
