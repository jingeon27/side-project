'use client';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@side/design-system';
import { SunMoon } from 'lucide-react';
import { useI18n } from '@/shared/i18n';
import { useThemePreference, setThemePreference, themePreference } from '@/shared/theme';

export function ThemeSettings() {
  const { t } = useI18n();
  const preference = useThemePreference();
  const items = [
    { value: 'system', label: t('기기 설정에 맞춤') },
    { value: 'light', label: t('라이트 모드') },
    { value: 'dark', label: t('다크 모드') },
  ];
  function handleChange(value: string | null) {
    if (value) setThemePreference(themePreference(value));
  }
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
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </section>
  );
}
