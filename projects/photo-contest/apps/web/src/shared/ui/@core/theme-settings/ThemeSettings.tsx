'use client';

import { SunMoon } from 'lucide-react';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@side/design-system';

import { parseThemePreference, useThemePreference, type TThemePreference } from '../../../model/theme';
import { toast } from '../../../model/toast';

const items = [
  { value: 'system', label: '기기 설정에 맞춤' },
  { value: 'light', label: '라이트 모드' },
  { value: 'dark', label: '다크 모드' },
] satisfies { value: TThemePreference; label: string }[];

export function ThemeSettings() {
  const { preference, setPreference } = useThemePreference();
  return (
    <section aria-labelledby="theme-title" className="order-3 flex flex-col gap-3 desktop:order-none">
      <h2 id="theme-title" className="flex items-center gap-2 text-label text-ink">
        <SunMoon aria-hidden className="size-4" />
        화면 모드
      </h2>
      <Select
        items={items}
        value={preference}
        onValueChange={(value) => {
          if (!value || value === preference) return;
          setPreference(parseThemePreference(value));
          toast.info('화면 모드를 변경했어요.');
        }}
      >
        <SelectTrigger aria-label="화면 모드" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="start" alignItemWithTrigger={false}>
          <SelectItem value="system">기기 설정에 맞춤</SelectItem>
          <SelectItem value="light">라이트 모드</SelectItem>
          <SelectItem value="dark">다크 모드</SelectItem>
        </SelectContent>
      </Select>
      <p className="text-caption text-muted">선택한 화면 모드는 이 기기에 저장돼요.</p>
    </section>
  );
}
