'use client';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@side/design-system';
import { Globe2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { setLanguagePreference, useI18n } from './LanguageProvider';
import { languagePreference, localePath } from './locale';

interface ILanguageSelectProps {
  id?: string;
  compact?: boolean;
}

export function LanguageSelect({ id, compact = false }: ILanguageSelectProps) {
  const { t, automaticLocale, preference } = useI18n();
  const router = useRouter();
  const items = [
    { value: 'auto', label: t('기기 설정에 맞춤') },
    { value: 'ko', label: '한국어' },
    { value: 'en', label: 'English' },
    { value: 'ja', label: '日本語' },
  ];
  function handleChange(value: string | null) {
    if (!value) return;
    const next = languagePreference(value);
    setLanguagePreference(next);
    const target = next === 'auto' ? automaticLocale : next;
    router.replace(
      localePath(window.location.pathname + window.location.search + window.location.hash, target),
      { scroll: false },
    );
  }
  return (
    <Select items={items} value={preference} onValueChange={handleChange}>
      <SelectTrigger
        id={id}
        aria-label={t('언어 설정')}
        title={compact ? t('언어 설정') : undefined}
        hideIcon={compact}
        className={
          compact
            ? 'size-touch justify-center border-transparent bg-transparent p-0 text-muted hover:bg-neutral-soft [&>svg]:size-5'
            : 'w-full'
        }
      >
        {compact ? (
          <>
            <Globe2 size={20} aria-hidden="true" />
            <SelectValue className="sr-only" />
          </>
        ) : (
          <SelectValue />
        )}
      </SelectTrigger>
      <SelectContent align={compact ? 'end' : 'start'} alignItemWithTrigger={false}>
        {items.map((item) => (
          <SelectItem
            key={item.value}
            value={item.value}
            lang={item.value === 'auto' ? undefined : item.value}
          >
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
